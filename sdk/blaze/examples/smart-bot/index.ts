import { Unwrapped } from "@blaze-cardano/ogmios";
import { Blaze, Data, HotWallet, Kupmios, Wallet, Provider, Blockfrost } from "@blaze-cardano/sdk";
import { NetworkId } from "@blaze-cardano/core";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();
import { 
    GameIdentifier, 
    createShip,
    gatherFuel, 
    moveShip, 
    mineAsteria,
    OutRef, 
    outRefToTransactionInput, 
    ShipDatum, 
    slotToUnix,
    SpaceTimeScriptDatum,
    PelletScriptDatum
} from "../../src";
import { 
    mnemonicToEntropy, 
    wordlist, 
    Bip32PrivateKey, 
    TransactionId, 
    TransactionInput,
    AssetId,
    addressFromBech32
} from "@blaze-cardano/core";

import { GameStateManager } from "./game-state";
import { SpawnOptimizer } from "./spawn-optimizer";
import { Pathfinder } from "./pathfinding";
import { FuelManager } from "./fuel-manager";
import { Position, GAME_CONFIG } from "./types";

class SmartAsteriaBot {
    private provider!: Kupmios;  // For transactions and tip queries
    private blockfrost!: Blockfrost;  // For reliable data queries
    private wallet!: Wallet;
    private blaze!: Blaze<Kupmios, Wallet>;
    private gameState!: GameStateManager;
    private spawnOptimizer!: SpawnOptimizer;
    private pathfinder!: Pathfinder;
    private fuelManager!: FuelManager;
    
    // Game references
    private spacetimeScriptReference: OutRef;
    private pelletScriptReference: OutRef;
    private asteriaScriptReference: OutRef;
    private shipUtxoRef?: OutRef;
    
    // Addresses and policies
    private pelletValidatorAddress: any;
    private spacetimeValidatorAddress: any;
    private asteriaValidatorAddress: any;
    private fuelToken!: AssetId;
    private shipyardPolicy!: string;
    
    // Bot state
    private myAddress: string;
    private shipPosition?: Position;
    private shipFuel: bigint = 0n;
    private moveCount: number = 0;
    private startTime: number = Date.now();

    constructor() {
        // Initialize script references - these should be provided or queried
        this.spacetimeScriptReference = {
            tx_hash: process.env.SPACETIME_REF_TX || "3d308c0f3deb1eff764cbb765452c53d30704748681d7acd61c7775aeb8a8e46",
            tx_index: 1n,
        };
        
        this.pelletScriptReference = {
            tx_hash: process.env.PELLET_REF_TX || "3d308c0f3deb1eff764cbb765452c53d30704748681d7acd61c7775aeb8a8e46",
            tx_index: 2n,
        };
        
        this.asteriaScriptReference = {
            tx_hash: process.env.ASTERIA_REF_TX || "3d308c0f3deb1eff764cbb765452c53d30704748681d7acd61c7775aeb8a8e46",
            tx_index: 0n,
        };

        this.myAddress = process.env.WALLET_ADDRESS || 
            "addr1qy45nexa87ms28jxe48rqs5g36sgrjej9n4fp09h9ftdxr60053vjzxn37ayva7d6fghzfeg8g20axhzjvtd4awz5g5s32wyqz";

        // Initialize validator addresses
        this.pelletValidatorAddress = addressFromBech32("addr1wya6hnluvypwcfww6s8p5f8m5gphryjugmcznxetj3trvrsc307jj");
        this.spacetimeValidatorAddress = addressFromBech32("addr1wypfrtn6awhsvjmc24pqj0ptzvtfalang33rq8ng6j6y7scnlkytx");
        this.asteriaValidatorAddress = addressFromBech32("addr1w824uvev63kj40lzfhaq2kxzmmwsz9xsqsjr2t4cq74vzdcdw8c77");
    }

    async initialize(): Promise<void> {
        console.log("🚀 Initializing Smart Asteria Bot with hybrid Blockfrost + Kupo approach...");
        
        // Initialize Kupo/Ogmios provider for transactions and tip queries
        this.provider = new Kupmios(
            process.env.KUPO_URL || "https://kupo1shqzdry3gh2dsgdy3lg.mainnet-v2.kupo-m1.demeter.run",
            await Unwrapped.Ogmios.new(process.env.OGMIOS_URL || "https://ogmios199hxc0fnr4wpjg8cp37.mainnet-v6.ogmios-m1.demeter.run")
        );

        // Initialize Blockfrost for reliable data queries
        const blockfrostProjectId = process.env.BLOCKFROST_PROJECT_ID;
        if (!blockfrostProjectId) {
            throw new Error("BLOCKFROST_PROJECT_ID environment variable required");
        }
        console.log("🔗 Initializing Blockfrost with project ID:", blockfrostProjectId);
        this.blockfrost = new Blockfrost({
            network: "cardano-mainnet",
            projectId: blockfrostProjectId
        });

        const mnemonic = process.env.SEED;
        if (!mnemonic) throw new Error("SEED environment variable required");
        
        const entropy = mnemonicToEntropy(mnemonic, wordlist);
        const masterkey = Bip32PrivateKey.fromBip39Entropy(Buffer.from(entropy), "");
        this.wallet = await HotWallet.fromMasterkey(masterkey.hex(), this.provider);
        this.blaze = await Blaze.from(this.provider, this.wallet);

        // Get fuel token and shipyard policy from reference scripts
        await this.initializePolicies();

        // Initialize game components using Blockfrost for data queries
        this.gameState = new GameStateManager(
            this.blockfrost,  // Use Blockfrost for reliable pellet/ship queries
            this.pelletValidatorAddress,
            this.spacetimeValidatorAddress,
            this.fuelToken,
            this.shipyardPolicy
        );

        console.log("📋 Hybrid setup complete:");
        console.log("   🔗 Blockfrost: Data queries (pellets, ships)");
        console.log("   ⚡ Kupo/Ogmios: Transactions and tip queries");
        
        this.spawnOptimizer = new SpawnOptimizer(this.gameState);
        this.pathfinder = new Pathfinder(this.gameState);
        this.fuelManager = new FuelManager(this.gameState);

        console.log("✅ Bot initialized successfully");
    }

    private async initializePolicies(): Promise<void> {
        // Use known correct policy IDs from mainnet
        // These were verified from our Blockfrost testing
        const fuelPolicy = "3babcffc6102ec25ced40e1a24fba20371925c46f0299b2b9456360e";
        this.shipyardPolicy = "3babcffc6102ec25ced40e1a24fba20371925c46f0299b2b9456360e"; // Same policy for shipyard
        
        this.fuelToken = AssetId(fuelPolicy + "4655454C"); // "FUEL" in hex
        
        console.log("📋 Initialized policies (using known mainnet values):");
        console.log(`   Shipyard: ${this.shipyardPolicy}`);
        console.log(`   Fuel: ${fuelPolicy}`);
        console.log(`   Fuel token: ${this.fuelToken}`);
    }

    async run(): Promise<void> {
        console.log("\n🎮 Starting Smart Asteria Bot");
        console.log("================================\n");

        try {
            // Phase 1: Pre-spawn analysis
            await this.preSpawnAnalysis();
            
            // Phase 2: Create ship at optimal position
            const spawnSuccess = await this.createOptimalShip();
            if (!spawnSuccess) {
                console.error("❌ Failed to create ship");
                return;
            }
            
            // Phase 3: Navigate to origin
            await this.navigateToOrigin();
            
            // Phase 4: Mine Asteria
            await this.mineAsteriaRewards();
            
            console.log("\n🎉 Mission Complete!");
            this.printFinalStats();
            
        } catch (error) {
            console.error("❌ Bot error:", error);
        }
    }

    private async preSpawnAnalysis(): Promise<void> {
        console.log("\n📊 Phase 1: Pre-Spawn Analysis");
        console.log("--------------------------------");
        
        // Update game state
        await this.gameState.updateGameState();
        
        // Analyze pellet distribution
        const pellets = this.gameState.getAllPellets();
        const ships = this.gameState.getAllShips();
        
        console.log(`📍 Total pellets available: ${pellets.length}`);
        console.log(`🚢 Other ships on grid: ${ships.length}`);
        
        // Update fuel strategy based on pellet availability
        this.fuelManager.updateStrategy(pellets.length);
    }

    private async createOptimalShip(): Promise<boolean> {
        console.log("\n🎯 Phase 2: Ship Creation");
        console.log("-------------------------");
        
        // Find optimal spawn position
        const optimalSpawn = await this.spawnOptimizer.findOptimalSpawnPosition();
        
        if (!optimalSpawn) {
            console.error("❌ Could not find valid spawn position");
            return false;
        }
        
        // Check if we have an existing ship
        const existingShipRef = process.env.SHIP_UTXO_REF;
        if (existingShipRef) {
            const [txHash, txIndex] = existingShipRef.split('#');
            this.shipUtxoRef = {
                tx_hash: txHash,
                tx_index: BigInt(txIndex || 0)
            };
            console.log("📍 Using existing ship");
            return true;
        }
        
        console.log(`\n🚀 Creating ship at (${optimalSpawn.position.x}, ${optimalSpawn.position.y})`);
        
        try {
            const gameIdentifier: GameIdentifier = {
                spacetime_script_reference: this.spacetimeScriptReference,
                pellet_script_reference: this.pelletScriptReference,
                asteria_script_reference: this.asteriaScriptReference
            };
            
            const tx = await createShip(
                this.provider,
                this.myAddress,
                gameIdentifier,
                optimalSpawn.position.x,
                optimalSpawn.position.y
            );
            
            const signedTx = await this.blaze.signTransaction(tx);
            const txId = await this.blaze.provider.postTransactionToChain(signedTx);
            
            console.log(`✅ Ship created! TX: ${txId}`);
            
            this.shipUtxoRef = {
                tx_hash: txId,
                tx_index: 0n
            };
            
            this.shipPosition = optimalSpawn.position;
            this.shipFuel = BigInt(GAME_CONFIG.initialFuel);
            
            // Wait for confirmation
            await this.waitForTransaction(txId);
            
            // Wait for initial cooldown after ship creation
            console.log("⏳ Waiting for initial ship cooldown...");
            await this.delay(GAME_CONFIG.maxSpeed.time);
            console.log("✅ Initial cooldown complete");
            
            return true;
            
        } catch (error) {
            console.error("❌ Failed to create ship:", error);
            return false;
        }
    }

    private async navigateToOrigin(): Promise<void> {
        console.log("\n🗺️ Phase 3: Navigation to Origin");
        console.log("---------------------------------");
        
        const origin: Position = { x: 0n, y: 0n };
        let hasToWait = false;
        
        while (this.shipPosition && (this.shipPosition.x !== 0n || this.shipPosition.y !== 0n)) {
            // Update ship state
            await this.updateShipState();
            
            // Check if we've reached the origin
            if (this.shipPosition.x === 0n && this.shipPosition.y === 0n) {
                console.log("🎯 Reached Asteria at (0,0)!");
                break;
            }
            
            // Wait for move cooldown if needed
            if (hasToWait) {
                await this.waitForMoveCooldown();
            }
            
            // Log current status
            console.log(`\n📍 Position: (${this.shipPosition.x}, ${this.shipPosition.y})`);
            console.log(`⛽ Fuel: ${this.shipFuel}/${GAME_CONFIG.maxShipFuel}`);
            console.log(this.fuelManager.getFuelStatus(Number(this.shipFuel), this.shipPosition));
            
            // Check for pellet at current position
            if (this.fuelManager.hasPelletAtPosition(this.shipPosition)) {
                console.log("⛽ Pellet available at current position!");
                await this.gatherFuelAtPosition();
                hasToWait = true; // Set flag so we wait for cooldown on next iteration
                continue;
            }
            
            // Determine next action
            const action = await this.determineNextAction();
            
            if (action.type === "move") {
                await this.executeMove(action.dx!, action.dy!);
                hasToWait = true;
            } else if (action.type === "gather") {
                await this.gatherFuelAtPosition();
            } else if (action.type === "stuck") {
                console.error("❌ Bot is stuck! No valid moves available.");
                break;
            }
            
            this.moveCount++;
        }
    }

    private async determineNextAction(): Promise<{ type: string; dx?: bigint; dy?: bigint }> {
        const origin: Position = { x: 0n, y: 0n };
        
        // If out of fuel at current position with pellet, must gather
        if (this.shipFuel === 0n) {
            if (this.fuelManager.hasPelletAtPosition(this.shipPosition!)) {
                return { type: "gather" };
            }
            return { type: "stuck" };
        }
        
        // Check if we need refueling
        if (this.fuelManager.needsRefueling(Number(this.shipFuel), this.shipPosition!)) {
            const refuelTarget = this.fuelManager.findBestRefuelTarget(
                this.shipPosition!,
                Number(this.shipFuel)
            );
            
            if (refuelTarget) {
                console.log(`🎯 Targeting pellet at (${refuelTarget.position.x}, ${refuelTarget.position.y})`);
                const move = this.pathfinder.calculateNextMove(
                    this.shipPosition!,
                    refuelTarget.position
                );
                return { type: "move", dx: move.dx, dy: move.dy };
            }
        }
        
        // Direct path to origin
        const path = this.pathfinder.findPath(
            this.shipPosition!,
            origin,
            Number(this.shipFuel),
            true
        );
        
        if (path.success && path.nodes.length > 1) {
            const nextPos = path.nodes[1];
            const dx = nextPos.x - this.shipPosition!.x;
            const dy = nextPos.y - this.shipPosition!.y;
            return { type: "move", dx, dy };
        }
        
        // Fallback: simple move toward origin
        const move = this.pathfinder.calculateNextMove(this.shipPosition!, origin);
        return { type: "move", dx: move.dx, dy: move.dy };
    }

    private async executeMove(dx: bigint, dy: bigint): Promise<void> {
        console.log(`🚀 Moving (${dx}, ${dy})...`);
        
        try {
            const gameIdentifier: GameIdentifier = {
                ship_utxo: this.shipUtxoRef!,
                spacetime_script_reference: this.spacetimeScriptReference,
                pellet_script_reference: this.pelletScriptReference
            };
            
            const tx = await moveShip(
                this.provider,
                this.myAddress,
                gameIdentifier,
                dx,
                dy
            );
            
            const signedTx = await this.blaze.signTransaction(tx);
            const txId = await this.blaze.provider.postTransactionToChain(signedTx);
            
            console.log(`✅ Move executed! TX: ${txId}`);
            
            // Update ship reference
            this.shipUtxoRef = {
                tx_hash: txId,
                tx_index: 0n
            };
            
            // Update position
            this.shipPosition = {
                x: this.shipPosition!.x + dx,
                y: this.shipPosition!.y + dy
            };
            this.shipFuel -= 1n;
            
            await this.waitForTransaction(txId);
            
        } catch (error) {
            console.error("❌ Move failed:", error);
            throw error;
        }
    }

    private async gatherFuelAtPosition(): Promise<void> {
        console.log("⛽ Gathering fuel...");
        
        const pellet = this.gameState.getPelletAt(this.shipPosition!);
        if (!pellet) {
            console.log("⚠️ No pellet at current position");
            return;
        }
        
        try {
            const pelletRef: OutRef = {
                tx_hash: pellet.utxo.input().transactionId(),
                tx_index: pellet.utxo.input().index()
            };
            
            const gameIdentifier: GameIdentifier = {
                ship_utxo: this.shipUtxoRef!,
                pellet_utxo: pelletRef,
                spacetime_script_reference: this.spacetimeScriptReference,
                pellet_script_reference: this.pelletScriptReference
            };
            
            const tx = await gatherFuel(
                this.provider,
                this.myAddress,
                gameIdentifier
            );
            
            const signedTx = await this.blaze.signTransaction(tx);
            const txId = await this.blaze.provider.postTransactionToChain(signedTx);
            
            console.log(`✅ Fuel gathered! TX: ${txId}`);
            
            // Update ship reference
            this.shipUtxoRef = {
                tx_hash: txId,
                tx_index: 0n
            };
            
            // Update fuel
            const fuelGained = Math.min(
                Number(pellet.fuel),
                GAME_CONFIG.maxShipFuel - Number(this.shipFuel)
            );
            this.shipFuel = BigInt(Number(this.shipFuel) + fuelGained);
            
            console.log(`⛽ Fuel: ${this.shipFuel}/${GAME_CONFIG.maxShipFuel}`);
            
            // Remove pellet from game state
            this.gameState.removePellet(this.shipPosition!);
            
            await this.waitForTransaction(txId);
            
        } catch (error) {
            console.error("❌ Gather fuel failed:", error);
        }
    }

    private async mineAsteriaRewards(): Promise<void> {
        console.log("\n💎 Phase 4: Mining Asteria");
        console.log("---------------------------");
        
        if (!this.shipPosition || this.shipPosition.x !== 0n || this.shipPosition.y !== 0n) {
            console.log("⚠️ Not at Asteria position");
            return;
        }
        
        try {
            const gameIdentifier: GameIdentifier = {
                ship_utxo: this.shipUtxoRef!,
                spacetime_script_reference: this.spacetimeScriptReference,
                pellet_script_reference: this.pelletScriptReference,
                asteria_script_reference: this.asteriaScriptReference
            };
            
            const tx = await mineAsteria(
                this.provider,
                this.myAddress,
                gameIdentifier
            );
            
            const signedTx = await this.blaze.signTransaction(tx);
            const txId = await this.blaze.provider.postTransactionToChain(signedTx);
            
            console.log(`✅ Asteria mined! TX: ${txId}`);
            console.log("🏆 Rewards claimed!");
            
            await this.waitForTransaction(txId);
            
        } catch (error) {
            console.error("❌ Mining failed:", error);
        }
    }

    private async updateShipState(): Promise<void> {
        if (!this.shipUtxoRef) return;
        
        try {
            const shipInput = outRefToTransactionInput(this.shipUtxoRef);
            // Use Kupo/Ogmios provider for transaction-related queries
            const shipUtxo = await this.provider.resolveUnspentOutputs([shipInput]);
            
            const datum = shipUtxo[0].output().datum()?.asInlineData();
            if (!datum) return;
            
            const shipDatum = Data.from(datum, ShipDatum);
            
            this.shipPosition = {
                x: shipDatum.pos_x,
                y: shipDatum.pos_y
            };
            
            let fuel = 0n;
            shipUtxo[0].output().amount().multiasset()?.forEach((value, asset) => {
                if (AssetId.getPolicyId(asset) === AssetId.getPolicyId(this.fuelToken)) {
                    fuel = value;
                }
            });
            
            this.shipFuel = fuel;
            this.gameState.updateMyShip(this.shipPosition, fuel);
            
        } catch (error) {
            console.error("⚠️ Could not update ship state:", error);
        }
    }

    private async waitForTransaction(txId: TransactionId): Promise<void> {
        console.log("⏳ Waiting for transaction confirmation...");
        
        let attempts = 0;
        const maxAttempts = 30;
        
        while (attempts < maxAttempts) {
            try {
                await this.delay(5000);
                // Use Kupo/Ogmios provider for transaction confirmation checks
                await this.provider.resolveUnspentOutputs([
                    new TransactionInput(txId, 0n)
                ]);
                console.log("✅ Transaction confirmed");
                return;
            } catch {
                attempts++;
            }
        }
        
        console.warn("⚠️ Transaction confirmation timeout");
    }

    private async waitForMoveCooldown(): Promise<void> {
        if (!this.shipUtxoRef) return;
        
        try {
            // Get the ship's last move time from the datum
            const shipInput = outRefToTransactionInput(this.shipUtxoRef);
            // Use Kupo/Ogmios provider for transaction-related queries
            const shipUtxo = await this.provider.resolveUnspentOutputs([shipInput]);
            
            const datum = shipUtxo[0].output().datum()?.asInlineData();
            if (!datum) {
                console.log("⚠️ No datum found, waiting full cooldown");
                await this.delay(GAME_CONFIG.maxSpeed.time);
                return;
            }
            
            const shipDatum = Data.from(datum, ShipDatum);
            const lastMoveTime = Number(shipDatum.last_move_latest_time);
            const currentTime = Date.now();
            const timeSinceLastMove = currentTime - lastMoveTime;
            const remainingCooldown = GAME_CONFIG.maxSpeed.time - timeSinceLastMove;
            
            if (remainingCooldown > 0) {
                console.log(`⏳ Waiting ${Math.round(remainingCooldown / 1000)}s remaining cooldown...`);
                await this.delay(remainingCooldown);
                console.log("✅ Cooldown complete");
            } else {
                console.log("✅ Cooldown already complete");
            }
            
        } catch (error) {
            console.log("⚠️ Could not read ship datum, waiting full cooldown");
            await this.delay(GAME_CONFIG.maxSpeed.time);
        }
    }

    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private printFinalStats(): void {
        const elapsed = Date.now() - this.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        
        console.log("\n📊 Final Statistics");
        console.log("-------------------");
        console.log(`🚀 Total moves: ${this.moveCount}`);
        console.log(`⏱️ Time elapsed: ${minutes}m ${seconds}s`);
        console.log(`⛽ Final fuel: ${this.shipFuel}`);
        console.log(`📍 Final position: (${this.shipPosition?.x || 0}, ${this.shipPosition?.y || 0})`);
    }
}

// Main entry point
async function main() {
    const bot = new SmartAsteriaBot();
    
    try {
        await bot.initialize();
        await bot.run();
    } catch (error) {
        console.error("Fatal error:", error);
        process.exit(1);
    }
}

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}

export { SmartAsteriaBot };