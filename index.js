import { Connection, Keypair, Transaction, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fetch from 'node-fetch';
// const fetch = require('node-fetch');
import bs58 from 'bs58';
import config from './dontshare.js'

function logWithTimestamp(message) {
    const timestamp = new Date().toISOString(); // Get the current time in ISO format
    console.log(`[${timestamp}] ${message}`);
}
logWithTimestamp('Very beginning of program');

// Replace 'PRIVATEKEY' with your actual private key
const privateKeyStr = config.private_key
const privateKey = bs58.decode(privateKeyStr);
const walletKeypair = Keypair.fromSecretKey(privateKey);

// Define multiple RPC endpoints
const rpcEndpoints = [
    config.rpc_url,
];

// Create multiple Connection instances
const connections = rpcEndpoints.map(endpoint => new Connection(endpoint, 'confirmed'));

// Accessing command-line arguments
// const input_token = process.argv[2]; // 'myInputToken'
// const output_token = process.argv[3]; // 'myOutputToken'
// const amount = process.argv[4]; // '100'

//Constants for testing
const input_token = "So11111111111111111111111111111111111111112";
const output_token = "ukHH6c7mMyiWCf1b9pnWe25TSpkDDt3H5pQZgZ74J82";
const amount = "150000";

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
                prioritizationFeeLamports: 0.001 * LAMPORTS_PER_SOL,
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

                await connection.confirmTransaction(txid)

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
