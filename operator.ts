// operator.ts
import { ethers } from "ethers";
import * as dotenv from "dotenv";
dotenv.config();

// ------------------------------
// CONFIGURATION
// ------------------------------
const PROVIDER_WS: string =
  process.env.PROVIDER_WS || "wss://your.websocket.provider";
const PRIVATE_KEY: string = process.env.PRIVATE_KEY || "";
const CONTRACT_ADDRESS: string = process.env.CONTRACT_ADDRESS || "";

// Auction parameters for new auctions (adjust as needed)
const NEW_AUCTION_START_PRICE = ethers.utils.parseUnits("100", 18);
const NEW_AUCTION_END_PRICE = ethers.utils.parseUnits("10", 18);
// Polling interval in milliseconds
const POLL_INTERVAL = 15 * 1000; // 15 seconds

// ------------------------------
// ABI (include events and functions we use)
// ------------------------------
const CONTRACT_ABI = [
  // Events
  "event AuctionStarted(uint256 startPrice, uint256 endPrice, uint256 startTime, uint256 duration)",
  "event AuctionEnded(address winner, uint256 winningBid, uint256 tokenId)",
  "event BidPlaced(address bidder, uint256 bidAmount, uint256 tokenId)",
  "event ProofSubmitted(uint256 tokenId, bytes32 proofHash)",
  "event PaymentClaimed(uint256 tokenId, uint256 amount)",
  "event WinningAdSelected(uint256 indexed tokenId, string title, string content, string imageURL, address indexed publisher, uint256 bidAmount)",

  // Auction functions
  "function startAuction(uint256 _startPrice, uint256 _endPrice) external",
  "function endAuctionNoBids() external",
  "function submitProof(uint256 _tokenId, bytes32 _proofHash) external",
  "function claimPayment(uint256 _tokenId) external",
  "function getAuctionState() external view returns (uint256 currentPrice, bool isActive, uint256 timeRemaining)",
  "function getWinnerInfo() external view returns (address winner, uint256 winningBid, uint256 winningTokenId)",
  "function getAdminState() external view returns (bool proofSubmitted, bool claimed, bool ended)",
];

// ------------------------------
// SETUP PROVIDER, SIGNER, AND CONTRACT
// ------------------------------
const provider = new ethers.providers.WebSocketProvider(PROVIDER_WS);
const operatorWallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  operatorWallet
);

// ------------------------------
// EVENT LISTENERS
// ------------------------------
function setupEventListeners(): void {
  contract.on(
    "AuctionStarted",
    (
      startPrice: ethers.BigNumber,
      endPrice: ethers.BigNumber,
      startTime: ethers.BigNumber,
      duration: ethers.BigNumber,
      event: any
    ) => {
      console.log("-----------------------------\n");
      console.log("Event: AuctionStarted");
      console.log(`  Start Price: ${ethers.utils.formatUnits(startPrice, 18)}`);
      console.log(`  End Price:   ${ethers.utils.formatUnits(endPrice, 18)}`);
      console.log(
        `  Start Time:  ${new Date(
          startTime.toNumber() * 1000
        ).toLocaleString()}`
      );
      console.log(`  Duration:    ${duration.toNumber()} seconds`);
      console.log(`  Tx Hash:     ${event.transactionHash}`);
      console.log("-----------------------------\n\n");
    }
  );

  contract.on(
    "AuctionEnded",
    (
      winner: string,
      winningBid: ethers.BigNumber,
      tokenId: ethers.BigNumber,
      event: any
    ) => {
      console.log("Event: AuctionEnded");
      console.log(`  Winner:       ${winner}`);
      console.log(
        `  Winning Bid:  ${ethers.utils.formatUnits(winningBid, 18)}`
      );
      console.log(`  Token ID:     ${tokenId.toString()}`);
      console.log(`  Tx Hash:      ${event.transactionHash}`);
    }
  );

  contract.on(
    "BidPlaced",
    (
      bidder: string,
      bidAmount: ethers.BigNumber,
      tokenId: ethers.BigNumber,
      event: any
    ) => {
      console.log("-----------------------------");
      console.log("Event: BidPlaced");
      console.log(`  Bidder:     ${bidder}`);
      console.log(
        `  Bid Amount USD: ${ethers.utils.formatUnits(bidAmount, 18)}`
      );
      console.log(`  Token ID:   ${tokenId.toString()}`);
      console.log(`  Tx Hash:    ${event.transactionHash}`);
      console.log("-----------------------------");
    }
  );

  contract.on(
    "ProofSubmitted",
    (tokenId: ethers.BigNumber, proofHash: string, event: any) => {
      console.log("Event: ProofSubmitted");
      console.log(`  Token ID:  ${tokenId.toString()}`);
      console.log(`  Proof:     ${proofHash}`);
      console.log(`  Tx Hash:   ${event.transactionHash}`);
    }
  );

  contract.on(
    "PaymentClaimed",
    (tokenId: ethers.BigNumber, amount: ethers.BigNumber, event: any) => {
      console.log("-----------------------------\n");
      console.log("Event: PaymentClaimed");
      console.log(`  Token ID: ${tokenId.toString()}`);
      console.log(`  Amount USD:   ${ethers.utils.formatUnits(amount, 18)}`);
      console.log(`  Tx Hash:  ${event.transactionHash}`);
      console.log("-----------------------------\n\n");
    }
  );

  contract.on(
    "WinningAdSelected",
    (
      tokenId: ethers.BigNumber,
      title: string,
      content: string,
      imageURL: string,
      publisher: string,
      bidAmount: ethers.BigNumber,
      event: any
    ) => {
      console.log("-----------------------------");
      console.log("Event: WinningAdSelected");
      console.log(`  Token ID:   ${tokenId.toString()}`);
      console.log(`  Title:      ${title}`);
      console.log(`  Content:    ${content}`);
      console.log(`  Image URL:  ${imageURL}`);
      console.log(`  Publisher:  ${publisher}`);
      console.log(`  Bid Amount: ${ethers.utils.formatUnits(bidAmount, 18)}`);
      console.log(`  Tx Hash:    ${event.transactionHash}`);
      console.log("-----------------------------\n\n");
    }
  );
}

// ------------------------------
// OPERATOR FUNCTIONS
// ------------------------------

/**
 * Checks the current auction status.
 *
 * - If the auction is still active, log its state.
 * - If the auction has ended with no winner, calls endAuctionNoBids and then starts a new auction.
 * - If the auction ended with a winner:
 *    - If proof has not yet been submitted, submits proof (using a bytes32 zero value).
 *    - Else if proof is submitted but payment not claimed, claims payment.
 *    - Else if proof is submitted and payment claimed, starts a new auction.
 */
async function checkAuctionStatus(): Promise<void> {
  try {
    const [currentPrice, isActive, timeRemaining]: [
      ethers.BigNumber,
      boolean,
      ethers.BigNumber
    ] = await contract.getAuctionState();

    if (isActive) {
      console.log(
        `Auction is active. Current price: ${ethers.utils.formatUnits(
          currentPrice,
          18
        )}, Time remaining: ${timeRemaining.toString()} seconds`
      );
      return;
    }

    console.log("Auction is no longer active.");

    // Get the winner info
    const winnerInfo = await contract.getWinnerInfo();
    const winner: string = winnerInfo.winner;
    const winningTokenId: ethers.BigNumber = winnerInfo.winningTokenId;

    if (winner === ethers.constants.AddressZero) {
      console.log("Auction ended with no bids. Calling endAuctionNoBids()...");
      const tx = await contract.endAuctionNoBids();
      console.log(`endAuctionNoBids() called. Tx Hash: ${tx.hash}`);
      await tx.wait();

      console.log("Starting new auction...");
      const tx2 = await contract.startAuction(
        NEW_AUCTION_START_PRICE,
        NEW_AUCTION_END_PRICE
      );
      console.log(`startAuction() called. Tx Hash: ${tx2.hash}`);
      await tx2.wait();
    } else {
      console.log(
        `Auction ended with a winner (${winner}). Checking admin state...`
      );
      const adminState = await contract.getAdminState();
      const proofSubmitted: boolean = adminState.proofSubmitted;
      const claimed: boolean = adminState.claimed;

      if (!proofSubmitted) {
        console.log(
          "Proof not yet submitted. Submitting proof (using 0x00 as proof)..."
        );
        // Create a zeroed bytes32 value. (0x00 with 64 zeros following '0x')
        const zeroProof: string = "0x" + "0".repeat(64);
        const tx = await contract.submitProof(winningTokenId, zeroProof);
        console.log(`submitProof() called. Tx Hash: ${tx.hash}`);
        await tx.wait();
      } else if (proofSubmitted && !claimed) {
        console.log(
          "Proof submitted but payment not claimed. Claiming payment..."
        );
        const tx = await contract.claimPayment(winningTokenId);
        console.log(`claimPayment() called. Tx Hash: ${tx.hash}`);
        await tx.wait();
      } else if (proofSubmitted && claimed) {
        console.log("Auction is fully settled. Starting new auction...");
        const tx = await contract.startAuction(
          NEW_AUCTION_START_PRICE,
          NEW_AUCTION_END_PRICE
        );
        console.log(`startAuction() called. Tx Hash: ${tx.hash}`);
        await tx.wait();
      }
    }
  } catch (error) {
    console.error("Error in checkAuctionStatus:", error);
  }
}

function startPolling(): void {
  console.log("Starting operator polling loop...");
  setInterval(checkAuctionStatus, POLL_INTERVAL);
}

// ------------------------------
// MAIN EXECUTION
// ------------------------------
async function main(): Promise<void> {
  setupEventListeners();
  console.log("Operator script is listening for events over WebSocket...");
  await checkAuctionStatus();
  startPolling();
}

main().catch((error: Error) => {
  console.error("Fatal error in operator script:", error);
  process.exit(1);
});
