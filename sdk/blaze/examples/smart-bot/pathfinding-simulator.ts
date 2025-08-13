#!/usr/bin/env node

import { Position, Pellet, GAME_CONFIG, manhattanDistance, positionToKey } from "./types";
import { GameStateManager } from "./game-state";
import { SpawnOptimizer } from "./spawn-optimizer";
import { Pathfinder } from "./pathfinding";
import { FuelManager } from "./fuel-manager";
import { Unwrapped } from "@blaze-cardano/ogmios";
import { Kupmios } from "@blaze-cardano/sdk";
import { AssetId, addressFromBech32 } from "@blaze-cardano/core";
import { extractPolicyIdFromAddress } from "../../src/utils";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Real game state manager for simulation
class SimulationGameStateManager extends GameStateManager {
    private simulatedPellets: Map<string, Pellet> = new Map();
    
    constructor(
        provider: Kupmios,
        pelletValidatorAddress: any,
        spacetimeValidatorAddress: any,
        fuelToken: AssetId,
        shipyardPolicy: string
    ) {
        super(provider, pelletValidatorAddress, spacetimeValidatorAddress, fuelToken, shipyardPolicy);
    }

    async loadRealPellets(): Promise<void> {
        console.log("🔍 Querying real pellets from the blockchain...");
        
        // Use the parent class method to load real pellets
        await super.updatePellets();
        
        // Copy real pellets to simulation state
        const realPellets = super.getAllPellets();
        this.simulatedPellets.clear();
        
        for (const pellet of realPellets) {
            this.simulatedPellets.set(positionToKey(pellet.position), pellet);
        }
        
        console.log(`✅ Loaded ${this.simulatedPellets.size} real pellets for simulation`);
    }

    // Override methods to use simulated data during testing
    getPelletAt(position: Position): Pellet | undefined {
        return this.simulatedPellets.get(positionToKey(position));
    }

    getAllPellets(): Pellet[] {
        return Array.from(this.simulatedPellets.values());
    }

    getAllShips(): any[] {
        // Return empty for simulation - we're only testing pathfinding
        return [];
    }

    getPelletsWithinDistance(position: Position, maxDistance: number): Pellet[] {
        const pellets: Pellet[] = [];
        
        for (const pellet of this.simulatedPellets.values()) {
            const distance = manhattanDistance(position, pellet.position);
            if (distance <= maxDistance) {
                pellets.push(pellet);
            }
        }
        
        return pellets.sort((a, b) => {
            const distA = manhattanDistance(position, a.position);
            const distB = manhattanDistance(position, b.position);
            return distA - distB;
        });
    }

    removePellet(position: Position): void {
        this.simulatedPellets.delete(positionToKey(position));
    }

    updateMyShip(position: Position, fuel: bigint): void {
        // Update local state for simulation
    }

    // Get pellet distribution info for real pellets
    getPelletStats(): any {
        const quadrants = { q1: 0, q2: 0, q3: 0, q4: 0 };
        let totalFuel = 0n;
        let closestToOrigin = Infinity;

        for (const pellet of this.simulatedPellets.values()) {
            const pos = pellet.position;
            totalFuel += pellet.fuel;
            
            // Determine quadrant
            if (pos.x >= 0n && pos.y >= 0n) quadrants.q1++;
            else if (pos.x < 0n && pos.y >= 0n) quadrants.q2++;
            else if (pos.x < 0n && pos.y < 0n) quadrants.q3++;
            else if (pos.x >= 0n && pos.y < 0n) quadrants.q4++;

            // Check distance to origin
            const distance = manhattanDistance(pos, { x: 0n, y: 0n });
            if (distance < closestToOrigin) {
                closestToOrigin = distance;
            }
        }

        return {
            totalPellets: this.simulatedPellets.size,
            totalFuel: Number(totalFuel),
            avgFuelPerPellet: this.simulatedPellets.size ? Number(totalFuel) / this.simulatedPellets.size : 0,
            quadrants,
            closestToOrigin
        };
    }
}

class PathfindingSimulator {
    private gameState: SimulationGameStateManager;
    private spawnOptimizer: SpawnOptimizer;
    private pathfinder: Pathfinder;
    private fuelManager: FuelManager;
    private provider: Kupmios;

    // Simulation state
    private currentPosition!: Position;
    private currentFuel: number = GAME_CONFIG.initialFuel;
    private totalMoves: number = 0;
    private fuelGathered: number = 0;
    private visitedPositions: Set<string> = new Set();
    private moveHistory: Array<{position: Position, fuel: number, action: string}> = [];

    constructor() {
        // We'll initialize these in the async init method
        this.gameState = null as any;
        this.spawnOptimizer = null as any;
        this.pathfinder = null as any;
        this.fuelManager = null as any;
        this.provider = null as any;
    }

    async initialize(): Promise<void> {
        console.log("🔧 Initializing simulation with real blockchain data...");
        
        // Check environment variables
        if (!process.env.KUPO_URL || !process.env.OGMIOS_URL) {
            throw new Error("Missing required environment variables: KUPO_URL, OGMIOS_URL");
        }

        // Initialize provider
        this.provider = new Kupmios(
            process.env.KUPO_URL,
            await Unwrapped.Ogmios.new(process.env.OGMIOS_URL)
        );

        // Initialize addresses and policies
        const pelletValidatorAddress = addressFromBech32("addr1wya6hnluvypwcfww6s8p5f8m5gphryjugmcznxetj3trvrsc307jj");
        const spacetimeValidatorAddress = addressFromBech32("addr1wypfrtn6awhsvjmc24pqj0ptzvtfalang33rq8ng6j6y7scnlkytx");
        
        // Extract policies from addresses (simplified for simulation)
        const pelletPolicy = extractPolicyIdFromAddress(pelletValidatorAddress);
        const shipyardPolicy = extractPolicyIdFromAddress(spacetimeValidatorAddress);
        const fuelToken = AssetId(pelletPolicy + "4655454C"); // "FUEL" in hex

        // Initialize game state manager with real blockchain connection
        this.gameState = new SimulationGameStateManager(
            this.provider,
            pelletValidatorAddress,
            spacetimeValidatorAddress,
            fuelToken,
            shipyardPolicy
        );

        // Initialize AI components
        this.spawnOptimizer = new SpawnOptimizer(this.gameState);
        this.pathfinder = new Pathfinder(this.gameState);
        this.fuelManager = new FuelManager(this.gameState);

        console.log("✅ Simulation initialized with real blockchain connection");
    }

    async runSimulation(): Promise<void> {
        console.log("🧪 Asteria Pathfinding Simulation");
        console.log("==================================\n");

        // Initialize components
        await this.initialize();
        
        // Load real pellet data
        await this.setupTestScenario();

        // Phase 1: Find optimal spawn
        console.log("🎯 Phase 1: Finding Optimal Spawn Position");
        console.log("------------------------------------------");
        
        const optimalSpawn = await this.spawnOptimizer.findOptimalSpawnPosition();
        
        if (!optimalSpawn) {
            console.error("❌ Could not find valid spawn position!");
            return;
        }

        this.currentPosition = optimalSpawn.position;
        console.log(`✅ Spawning at (${this.currentPosition.x}, ${this.currentPosition.y})`);
        console.log(`   Score: ${optimalSpawn.score.toFixed(2)}`);
        console.log(`   Expected moves: ${optimalSpawn.totalMoves}`);
        console.log(`   Nearby pellets: ${optimalSpawn.nearbyPellets}`);

        // Phase 2: Navigate to origin
        console.log("\n🗺️ Phase 2: Navigation Simulation");
        console.log("----------------------------------");
        
        await this.simulateNavigation();

        // Phase 3: Results
        this.showResults();
    }

    private async setupTestScenario(): Promise<void> {
        console.log("🔍 Loading real game state from blockchain...");
        
        try {
            // Load real pellets from the blockchain
            await this.gameState.loadRealPellets();
            
            const stats = this.gameState.getPelletStats();
            console.log(`📡 Real blockchain state:`);
            console.log(`   Total real pellets: ${stats.totalPellets}`);
            
            if (stats.totalPellets === 0) {
                console.log("⚠️ No real pellets found on blockchain");
                console.log("🎲 Adding mock pellets for pathfinding algorithm testing...");
                
                // Add strategic test pellets to simulate real game conditions
                this.addTestPellets();
                
                const newStats = this.gameState.getPelletStats();
                console.log(`✅ Test scenario ready with mock pellets:`);
                console.log(`   Total pellets: ${newStats.totalPellets}`);
                console.log(`   Total fuel available: ${newStats.totalFuel}`);
                console.log(`   Average fuel per pellet: ${newStats.avgFuelPerPellet.toFixed(1)}`);
                console.log(`   Closest pellet to origin: ${newStats.closestToOrigin} units away`);
                console.log(`   Distribution: Q1=${newStats.quadrants.q1}, Q2=${newStats.quadrants.q2}, Q3=${newStats.quadrants.q3}, Q4=${newStats.quadrants.q4}`);
            } else {
                console.log(`✅ Using real pellets from blockchain:`);
                console.log(`   Total fuel available: ${stats.totalFuel}`);
                console.log(`   Average fuel per pellet: ${stats.avgFuelPerPellet.toFixed(1)}`);
                console.log(`   Closest pellet to origin: ${stats.closestToOrigin} units away`);
                console.log(`   Distribution: Q1=${stats.quadrants.q1}, Q2=${stats.quadrants.q2}, Q3=${stats.quadrants.q3}, Q4=${stats.quadrants.q4}`);
            }
            
        } catch (error) {
            console.error("❌ Failed to load real pellets:", error);
            console.log("🔧 Let's test the connection with a simpler query...");
        }
    }

    private addTestPellets(): void {
        // Create a strategic pellet layout for testing pathfinding
        const testPellets = [
            // Create viable paths from spawn distance
            { x: 48, y: 15, fuel: 3 },   // Near min spawn distance
            { x: 42, y: 20, fuel: 2 },
            { x: 35, y: 25, fuel: 3 },
            { x: 28, y: 22, fuel: 2 },
            { x: 20, y: 15, fuel: 3 },
            { x: 15, y: 10, fuel: 2 },
            { x: 8, y: 6, fuel: 2 },     // Near origin
            
            // Other quadrants
            { x: -45, y: 20, fuel: 3 },
            { x: -30, y: 15, fuel: 2 },
            { x: -15, y: 8, fuel: 2 },
            
            { x: -25, y: -35, fuel: 3 },
            { x: -18, y: -25, fuel: 2 },
            { x: -10, y: -12, fuel: 2 },
            
            { x: 30, y: -40, fuel: 3 },
            { x: 22, y: -28, fuel: 2 },
            { x: 12, y: -15, fuel: 2 },
            { x: 6, y: -8, fuel: 2 },
            
            // Some scattered pellets
            { x: 55, y: -10, fuel: 1 },
            { x: -52, y: 8, fuel: 1 },
            { x: 10, y: 45, fuel: 1 },
            { x: -8, y: -48, fuel: 1 },
            
            // Very close to origin for final approach
            { x: 3, y: 2, fuel: 1 },
            { x: -2, y: 4, fuel: 1 },
            { x: 4, y: -3, fuel: 1 },
            { x: -1, y: -2, fuel: 1 },
        ];

        for (const pellet of testPellets) {
            const position: Position = { x: BigInt(pellet.x), y: BigInt(pellet.y) };
            const mockPellet: Pellet = {
                position,
                fuel: BigInt(pellet.fuel),
                utxo: null as any // Mock UTXO
            };
            
            // Add directly to simulation state
            (this.gameState as any).simulatedPellets.set(positionToKey(position), mockPellet);
        }
        
        console.log(`   Added ${testPellets.length} strategic test pellets`);
    }

    private async simulateNavigation(): Promise<void> {
        const origin: Position = { x: 0n, y: 0n };
        let stepCount = 0;
        const maxSteps = 200; // Safety limit

        this.recordMove("START");

        while (stepCount < maxSteps) {
            stepCount++;
            
            // Check if we reached the origin
            if (this.currentPosition.x === 0n && this.currentPosition.y === 0n) {
                console.log(`🎯 Reached origin at (0,0) after ${this.totalMoves} moves!`);
                break;
            }

            console.log(`\n--- Step ${stepCount} ---`);
            console.log(`📍 Position: (${this.currentPosition.x}, ${this.currentPosition.y})`);
            console.log(`⛽ Fuel: ${this.currentFuel}/${GAME_CONFIG.maxShipFuel}`);
            
            // Check for pellet at current position
            const pelletHere = this.gameState.getPelletAt(this.currentPosition);
            if (pelletHere) {
                console.log(`⛽ Found pellet with ${pelletHere.fuel} fuel!`);
                const fuelBefore = this.currentFuel;
                this.currentFuel = Math.min(
                    GAME_CONFIG.maxShipFuel,
                    this.currentFuel + Number(pelletHere.fuel)
                );
                this.fuelGathered += (this.currentFuel - fuelBefore);
                this.gameState.removePellet(this.currentPosition);
                this.recordMove(`GATHER +${this.currentFuel - fuelBefore} fuel`);
                console.log(`   Fuel: ${fuelBefore} → ${this.currentFuel}`);
                continue;
            }

            // Determine next action
            const action = this.determineNextAction();
            
            if (action.type === "move") {
                const newPos: Position = {
                    x: this.currentPosition.x + action.dx!,
                    y: this.currentPosition.y + action.dy!
                };
                
                console.log(`🚀 Moving (${action.dx}, ${action.dy}) to (${newPos.x}, ${newPos.y})`);
                
                this.currentPosition = newPos;
                this.currentFuel -= 1;
                this.totalMoves++;
                this.visitedPositions.add(positionToKey(this.currentPosition));
                this.recordMove(`MOVE (${action.dx}, ${action.dy})`);
                
            } else if (action.type === "stuck") {
                console.error("❌ Bot is stuck! No valid moves available.");
                break;
            }

            // Safety check
            if (this.currentFuel < 0) {
                console.error("❌ Negative fuel! Simulation error.");
                break;
            }
        }

        if (stepCount >= maxSteps) {
            console.log("⚠️ Simulation stopped at step limit");
        }
    }

    private determineNextAction(): { type: string; dx?: bigint; dy?: bigint } {
        const origin: Position = { x: 0n, y: 0n };
        
        // If out of fuel, we're stuck unless there's a pellet here (already checked)
        if (this.currentFuel === 0) {
            return { type: "stuck" };
        }
        
        // Check if we need refueling
        if (this.fuelManager.needsRefueling(this.currentFuel, this.currentPosition)) {
            const refuelTarget = this.fuelManager.findBestRefuelTarget(
                this.currentPosition,
                this.currentFuel
            );
            
            if (refuelTarget) {
                console.log(`🎯 Targeting pellet at (${refuelTarget.position.x}, ${refuelTarget.position.y})`);
                const move = this.pathfinder.calculateNextMove(
                    this.currentPosition,
                    refuelTarget.position
                );
                return { type: "move", dx: move.dx, dy: move.dy };
            }
        }
        
        // Try pathfinding to origin
        const path = this.pathfinder.findPath(
            this.currentPosition,
            origin,
            this.currentFuel,
            true
        );
        
        if (path.success && path.nodes.length > 1) {
            const nextPos = path.nodes[1];
            const dx = nextPos.x - this.currentPosition.x;
            const dy = nextPos.y - this.currentPosition.y;
            console.log(`🧭 Following A* path (${path.nodes.length} nodes, cost ${path.totalCost})`);
            return { type: "move", dx, dy };
        }
        
        // Fallback: simple move toward origin
        const move = this.pathfinder.calculateNextMove(this.currentPosition, origin);
        console.log(`🔄 Fallback: direct move toward origin`);
        return { type: "move", dx: move.dx, dy: move.dy };
    }

    private recordMove(action: string): void {
        this.moveHistory.push({
            position: { x: this.currentPosition.x, y: this.currentPosition.y },
            fuel: this.currentFuel,
            action
        });
    }

    private showResults(): void {
        console.log("\n📊 Simulation Results");
        console.log("=====================");
        
        const finalDistance = manhattanDistance(this.currentPosition, { x: 0n, y: 0n });
        const success = finalDistance === 0;
        
        console.log(`🎯 Final position: (${this.currentPosition.x}, ${this.currentPosition.y})`);
        console.log(`📏 Distance to origin: ${finalDistance}`);
        console.log(`🚀 Total moves: ${this.totalMoves}`);
        console.log(`⛽ Final fuel: ${this.currentFuel}/${GAME_CONFIG.maxShipFuel}`);
        console.log(`⛽ Fuel gathered: ${this.fuelGathered}`);
        console.log(`📍 Unique positions visited: ${this.visitedPositions.size}`);
        console.log(`${success ? '✅ SUCCESS' : '❌ FAILED'} - ${success ? 'Reached origin!' : 'Did not reach origin'}`);

        // Path efficiency analysis
        const startPos = this.moveHistory[0]?.position;
        if (startPos) {
            const directDistance = manhattanDistance(startPos, { x: 0n, y: 0n });
            const efficiency = ((directDistance / this.totalMoves) * 100).toFixed(1);
            console.log(`📈 Path efficiency: ${efficiency}% (${directDistance} direct vs ${this.totalMoves} actual)`);
        }

        // Show move history summary
        console.log(`\n📋 Move History (last 10 moves):`);
        const recentMoves = this.moveHistory.slice(-10);
        for (let i = 0; i < recentMoves.length; i++) {
            const move = recentMoves[i];
            console.log(`   ${i + 1}. (${move.position.x}, ${move.position.y}) ⛽${move.fuel} - ${move.action}`);
        }

        // Remaining pellets info
        const remainingPellets = this.gameState.getAllPellets().length;
        console.log(`\n⛽ Remaining pellets: ${remainingPellets}`);
        
        if (success) {
            console.log("\n🎉 Pathfinding algorithm SUCCESS!");
            console.log("   ✅ Found optimal spawn position");
            console.log("   ✅ Successfully navigated to origin");
            console.log("   ✅ Efficient fuel management");
        } else {
            console.log("\n❌ Pathfinding needs improvement:");
            console.log("   - Check fuel management logic");
            console.log("   - Review path planning algorithm");
            console.log("   - Analyze pellet distribution strategy");
        }
    }
}

// Run the simulation
async function main() {
    const simulator = new PathfindingSimulator();
    
    try {
        await simulator.runSimulation();
    } catch (error) {
        console.error("❌ Simulation failed:", error);
        console.log("\n💡 Make sure to set up your environment variables:");
        console.log("   KUPO_URL=http://localhost:1442");
        console.log("   OGMIOS_URL=ws://localhost:1337");
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(console.error);
}

export { PathfindingSimulator };