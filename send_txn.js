const { Connection, Keypair, Transaction, VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const fetch = require('node-fetch');
const bs58 = require('bs58');

function logWithTimestamp(message) {
    const timestamp = new Date().toISOString(); // Get the current time in ISO format
    console.log(`[${timestamp}] ${message}`);
}
logWithTimestamp('Very beginning of program');

// Replace 'PRIVATEKEY' with your actual private key
const privateKeyStr = 'PRIVATE_KEY';
const privateKey = bs58.decode(privateKeyStr);
const walletKeypair = Keypair.fromSecretKey(privateKey);

// Define multiple RPC endpoints
const rpcEndpoints = [
    'RPC_ENDPOINT',
];

// Create multiple Connection instances
const connections = rpcEndpoints.map(endpoint => new Connection(endpoint, 'confirmed'));

// Accessing command-line arguments
const input_token = process.argv[2]; // 'myInputToken'
const output_token = process.argv[3]; // 'myOutputToken'
const amount = process.argv[4]; // '100'

//Constants for testing
//const input_token = "So11111111111111111111111111111111111111112";
//const output_token = "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm";
//const amount = "15000";

logWithTimestamp(`Input Token: ${input_token}, Output Token: ${output_token}, Amount: ${amount}`);

async function performSwap() {
    try {
        logWithTimestamp('Fetching quote and creating swap transaction...');
        const quoteResponse = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${input_token}&outputMint=${output_token}&amount=${amount}&slippageBps=5000&maxAccounts=64`)
            .then(res => res.json());
        const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                quoteResponse,
                userPublicKey: walletKeypair.publicKey.toString(),
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: 0.01 * LAMPORTS_PER_SOL,
            })
        }).then(res => res.json());

        logWithTimestamp('Preparing transaction...');
        const { swapTransaction } = swapResponse;
        const swapTransactionBuffer = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuffer);

        logWithTimestamp('Signing transaction...');
        transaction.sign([walletKeypair]); // Ensure signers are passed as an array

        const serializedTransaction = transaction.serialize();

        // Send the transaction to all RPC endpoints simultaneously
        const sendPromises = connections.map(async (connection) => {
            try {
                const { blockhash } = await connection.getRecentBlockhash();
                transaction.recentBlockhash = blockhash;
                const txid = await connection.sendRawTransaction(serializedTransaction, {
                    skipPreflight: true,
                    preflightCommitment: 'processed'
                });
                logWithTimestamp(`Transaction sent with ID: ${txid} via ${connection.rpcEndpoint}`);
                return txid;
            } catch (error) {
                logWithTimestamp(`Error sending transaction via ${connection.rpcEndpoint}: ${error}`);
                return null;
            }
        });

        const txids = await Promise.all(sendPromises);
        txids.forEach((txid, index) => {
            if (txid) {
                // Optionally, confirm transaction here or elsewhere based on your application logic
                logWithTimestamp(`Transaction ${txid} sent via ${rpcEndpoints[index]}`);
            }
        });
    } catch (error) {
        logWithTimestamp(`Error during swap: ${error}`);
    }
}

(async () => {
    await performSwap();
})().catch(console.error);
