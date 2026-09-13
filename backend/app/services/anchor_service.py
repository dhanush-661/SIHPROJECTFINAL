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
from typing import List, Optional
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
        next_level = []
        for i in range(0, len(current_level), 2):
            left = current_level[i]
            right = current_level[i + 1] if (i + 1 < len(current_level)) else left
            combined = hashlib.sha256(f"{left}{right}".encode("utf-8")).hexdigest()
            next_level.append(combined)
        current_level = next_level
    
    return current_level[0]


class BlockchainAnchorService:
    """
    Manages cryptographic Merkle root anchoring to public EVM testnets.
    """

    def __init__(self):
        self.amoy_rpc = DEFAULT_AMOY_RPC
        self.sepolia_rpc = DEFAULT_SEPOLIA_RPC
        self.private_key = ANCHOR_PRIVATE_KEY

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
        net_name = "Polygon Amoy Testnet" if "amoy" in network.lower() else "Ethereum Sepolia Testnet"
        chain_id = 80002 if "amoy" in network.lower() else 11155111
        explorer_base = "https://amoy.polygonscan.com/tx/" if "amoy" in network.lower() else "https://sepolia.etherscan.com/tx/"

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

        try:
            # Try importing web3 lazily so web3 absence never breaks backend import
            from web3 import Web3  # type: ignore[import-not-found, import-untyped]
            from web3.middleware import ExtraDataToPOAMiddleware  # type: ignore[import-not-found, import-untyped]

            rpc_url = self.amoy_rpc if "amoy" in network.lower() else self.sepolia_rpc
            w3 = Web3(Web3.HTTPProvider(rpc_url, request_kwargs={"timeout": 5}))

            if "amoy" in network.lower():
                try:
                    w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
                except Exception:
                    pass

            if not w3.is_connected():
                logger.warning(f"Failed to connect to RPC {rpc_url}. Degrading gracefully.")
                return PublicAnchorStatus(
                    enabled=False,
                    status="FAILED",
                    network=net_name,
                    chain_id=chain_id,
                    merkle_root=merkle_root,
                    details=f"Could not connect to {net_name} RPC endpoint ({rpc_url})."
                )

            account = w3.eth.account.from_key(self.private_key)
            sender_address = account.address

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
