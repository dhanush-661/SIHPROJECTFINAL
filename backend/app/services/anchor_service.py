"""
app/services/anchor_service.py
==============================
Phase 7 — Public Blockchain Testnet Merkle Anchoring Service
Periodically/on-demand computes a Merkle root over a spill's evidence ledger
and anchors it to a public testnet (Polygon Amoy or Ethereum Sepolia).

CRITICAL REQUIREMENT: Must degrade gracefully. If testnet RPC fails, times out,
or wallet is unconfigured, continue with ledger-only verification and mark
public_anchor.enabled = false — never block the detection pipeline.
"""
import hashlib
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from app.schemas.evidence import PublicAnchorStatus

logger = logging.getLogger(__name__)

# Testnet RPC Configuration defaults
DEFAULT_AMOY_RPC = os.getenv("POLYGON_AMOY_RPC_URL", "https://rpc-amoy.polygon.technology")
DEFAULT_SEPOLIA_RPC = os.getenv("ETH_SEPOLIA_RPC_URL", "https://rpc.sepolia.org")
ANCHOR_PRIVATE_KEY = os.getenv("ANCHOR_WALLET_PRIVATE_KEY", "")


def compute_merkle_root(leaf_hashes: List[str]) -> str:
    """
    Computes standard SHA-256 Merkle Root over an ordered list of leaf hashes.
    If empty, returns 64 zeroes.
    """
    if not leaf_hashes:
        return "0000000000000000000000000000000000000000000000000000000000000000"
    
    current_level = list(leaf_hashes)
    while len(current_level) > 1:
        n = len(current_level)
        current_level = [
            hashlib.sha256(
                (current_level[i] + (current_level[i + 1] if i + 1 < n else current_level[i])).encode("utf-8")
            ).hexdigest()
            for i in range(0, n, 2)
        ]
    
    return current_level[0]


class BlockchainAnchorService:
    """
    Manages cryptographic Merkle root anchoring to public EVM testnets.
    Maintains persistent Web3 connections and cached account credentials
    for optimal performance and connection pool reuse.
    """

    def __init__(self):
        self.amoy_rpc = DEFAULT_AMOY_RPC
        self.sepolia_rpc = DEFAULT_SEPOLIA_RPC
        self.private_key = ANCHOR_PRIVATE_KEY
        self._w3_cache: Dict[str, Any] = {}
        self._cached_address: Optional[str] = None

    def _get_sender_address(self) -> Optional[str]:
        """Lazily extracts and caches public address from private key."""
        if not self.private_key or self.private_key.strip() == "":
            return None
        if self._cached_address is None:
            try:
                from eth_account import Account  # type: ignore[import-not-found, import-untyped]
                account = Account.from_key(self.private_key)
                self._cached_address = account.address
            except Exception:
                try:
                    from web3 import Web3  # type: ignore[import-not-found, import-untyped]
                    account = Web3().eth.account.from_key(self.private_key)
                    self._cached_address = account.address
                except Exception as e:
                    logger.warning(f"Could not derive address from private key: {e}")
                    return None
        return self._cached_address

    def _get_web3_client(self, network: str) -> Tuple[Optional[Any], str, int, str]:
        """
        Retrieves or initializes a cached Web3 client with connection pooling and middleware.
        Returns (w3, net_name, chain_id, explorer_base).
        """
        is_amoy = "amoy" in network.lower()
        net_key = "polygon_amoy" if is_amoy else "ethereum_sepolia"
        net_name = "Polygon Amoy Testnet" if is_amoy else "Ethereum Sepolia Testnet"
        chain_id = 80002 if is_amoy else 11155111
        explorer_base = "https://amoy.polygonscan.com/tx/" if is_amoy else "https://sepolia.etherscan.com/tx/"
        rpc_url = self.amoy_rpc if is_amoy else self.sepolia_rpc

        if net_key in self._w3_cache:
            return self._w3_cache[net_key], net_name, chain_id, explorer_base

        try:
            from web3 import Web3  # type: ignore[import-not-found, import-untyped]
            from web3.middleware import ExtraDataToPOAMiddleware  # type: ignore[import-not-found, import-untyped]

            w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 5}))

            if is_amoy:
                try:
                    w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
                except Exception:
                    pass

            self._w3_cache[net_key] = w3
            return w3, net_name, chain_id, explorer_base
        except Exception as e:
            logger.warning(f"Failed to initialize Web3 client for {net_name}: {e}")
            return None, net_name, chain_id, explorer_base

    def anchor_merkle_root(
        self,
        spill_id: str,
        merkle_root: str,
        network: str = "polygon_amoy"
    ) -> PublicAnchorStatus:
        """
        Attempts to broadcast a minimal 0-value transaction carrying the Merkle root
        in the data field to Polygon Amoy or Sepolia testnet.
        
        Degrades gracefully on missing keys, network timeouts, or RPC failures.
        """
        now_utc = datetime.now(timezone.utc).isoformat()
        w3, net_name, chain_id, explorer_base = self._get_web3_client(network)

        if not self.private_key or self.private_key.strip() == "":
            logger.info(f"Public testnet wallet unconfigured. Skipping live on-chain anchor for {spill_id} gracefully.")
            return PublicAnchorStatus(
                enabled=False,
                status="NOT_CONFIGURED",
                network=net_name,
                chain_id=chain_id,
                merkle_root=merkle_root,
                tx_hash=None,
                explorer_url=None,
                anchored_at=now_utc,
                details="No ANCHOR_WALLET_PRIVATE_KEY provided in environment. Ledger verified locally."
            )

        if w3 is None:
            return PublicAnchorStatus(
                enabled=False,
                status="FAILED",
                network=net_name,
                chain_id=chain_id,
                merkle_root=merkle_root,
                details=f"Web3 dependency or client initialization unavailable for {net_name}."
            )

        try:
            from web3 import Web3  # type: ignore[import-not-found, import-untyped]

            sender_address = self._get_sender_address()
            if not sender_address:
                account = w3.eth.account.from_key(self.private_key)
                sender_address = account.address
                self._cached_address = sender_address

            if not w3.is_connected():
                rpc_url = self.amoy_rpc if "amoy" in network.lower() else self.sepolia_rpc
                logger.warning(f"Failed to connect to RPC {rpc_url}. Degrading gracefully.")
                return PublicAnchorStatus(
                    enabled=False,
                    status="FAILED",
                    network=net_name,
                    chain_id=chain_id,
                    merkle_root=merkle_root,
                    details=f"Could not connect to {net_name} RPC endpoint ({rpc_url})."
                )

            # Minimal 0-value transaction with Merkle Root as hex data payload (No spill data on-chain)
            data_bytes = Web3.to_bytes(text=f"AquaSentinel:Root:{merkle_root}")
            nonce = w3.eth.get_transaction_count(sender_address)
            gas_price = w3.eth.gas_price

            tx_params = {
                "nonce": nonce,
                "to": sender_address,  # Self-transfer with data payload
                "value": 0,
                "gas": 45000,
                "gasPrice": gas_price,
                "chainId": chain_id,
                "data": data_bytes
            }

            signed_tx = w3.eth.account.sign_transaction(tx_params, private_key=self.private_key)
            tx_hash_bytes = w3.eth.send_raw_transaction(signed_tx.raw_transaction)
            tx_hash_hex = Web3.to_hex(tx_hash_bytes)

            explorer_url = f"{explorer_base}{tx_hash_hex}"
            logger.info(f"Successfully anchored Merkle root for {spill_id} on {net_name}: {tx_hash_hex}")

            return PublicAnchorStatus(
                enabled=True,
                status="ANCHORED",
                network=net_name,
                chain_id=chain_id,
                merkle_root=merkle_root,
                tx_hash=tx_hash_hex,
                explorer_url=explorer_url,
                anchored_at=now_utc,
                details=f"Merkle root anchored on {net_name}."
            )

        except Exception as e:
            logger.warning(f"Blockchain testnet anchor failed for {spill_id} ({e}). Degrading gracefully.")
            return PublicAnchorStatus(
                enabled=False,
                status="FAILED",
                network=net_name,
                chain_id=chain_id,
                merkle_root=merkle_root,
                details=f"Anchor attempt failed gracefully: {str(e)}"
            )


anchor_service = BlockchainAnchorService()

