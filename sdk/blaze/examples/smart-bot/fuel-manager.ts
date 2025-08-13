import { Position, Pellet, GAME_CONFIG, manhattanDistance } from "./types";
import { GameStateManager } from "./game-state";

export class FuelManager {
    private gameState: GameStateManager;
    private conservativeMode: boolean = false;

    constructor(gameState: GameStateManager) {
        this.gameState = gameState;
    }

    /**
     * Determine if we need to refuel based on current situation
     */
    needsRefueling(currentFuel: number, currentPosition: Position): boolean {
        const distanceToOrigin = manhattanDistance(currentPosition, { x: 0n, y: 0n });
        
        // Always refuel if we're out of fuel
        if (currentFuel === 0) return true;
        
        // Check if we have enough fuel to reach origin
        if (currentFuel >= distanceToOrigin) return false;
        
        // Check if we can reach a pellet and then origin
        const reachablePellets = this.getReachablePellets(currentPosition, currentFuel);
        
        // If no reachable pellets, don't suggest refueling (we can't)
        if (reachablePellets.length === 0) return false;
        
        // In conservative mode, refuel when below 3
        if (this.conservativeMode && currentFuel < 3) return true;
        
        // In normal mode, refuel when below 2
        return currentFuel < 2;
    }

    /**
     * Find the best pellet to refuel at
     */
    findBestRefuelTarget(currentPosition: Position, currentFuel: number): Pellet | null {
        const reachablePellets = this.getReachablePellets(currentPosition, currentFuel);
        
        if (reachablePellets.length === 0) return null;
        
        // Score each pellet
        const scoredPellets = reachablePellets.map(pellet => {
            const distanceToPellet = manhattanDistance(currentPosition, pellet.position);
            const distanceToOrigin = manhattanDistance(pellet.position, { x: 0n, y: 0n });
            
            // Calculate fuel after reaching pellet
            const fuelAfterReaching = currentFuel - distanceToPellet;
            const fuelAfterRefuel = Math.min(
                GAME_CONFIG.maxShipFuel,
                fuelAfterReaching + Number(pellet.fuel)
            );
            
            // Score factors:
            // 1. Prefer pellets that get us closer to origin
            // 2. Prefer pellets that give more fuel
            // 3. Prefer closer pellets (less travel cost)
            const progressScore = manhattanDistance(currentPosition, { x: 0n, y: 0n }) - distanceToOrigin;
            const fuelGainScore = Number(pellet.fuel);
            const proximityScore = -distanceToPellet;
            
            // Check if this pellet allows us to reach origin
            const canReachOriginAfter = fuelAfterRefuel >= distanceToOrigin;
            
            return {
                pellet,
                score: progressScore * 2 + fuelGainScore * 1.5 + proximityScore + (canReachOriginAfter ? 100 : 0)
            };
        });
        
        // Sort by score and return best
        scoredPellets.sort((a, b) => b.score - a.score);
        
        return scoredPellets[0]?.pellet || null;
    }

    /**
     * Get pellets reachable with current fuel
     */
    getReachablePellets(position: Position, fuel: number): Pellet[] {
        return this.gameState.getPelletsWithinDistance(position, fuel);
    }

    /**
     * Check if there's a pellet at current position
     */
    hasPelletAtPosition(position: Position): boolean {
        return this.gameState.getPelletAt(position) !== undefined;
    }

    /**
     * Calculate fuel needed to reach a target
     */
    calculateFuelNeeded(from: Position, to: Position): number {
        return manhattanDistance(from, to);
    }

    /**
     * Plan fuel stops for a path
     */
    planFuelStops(path: Position[], initialFuel: number): Position[] {
        const fuelStops: Position[] = [];
        let currentFuel = initialFuel;
        
        for (let i = 1; i < path.length; i++) {
            currentFuel--; // Cost of moving
            
            if (currentFuel < 0) {
                console.warn("⚠️ Path simulation shows fuel shortage!");
                break;
            }
            
            const pellet = this.gameState.getPelletAt(path[i]);
            if (pellet) {
                const fuelBefore = currentFuel;
                currentFuel = Math.min(GAME_CONFIG.maxShipFuel, currentFuel + Number(pellet.fuel));
                
                if (fuelBefore < GAME_CONFIG.maxShipFuel) {
                    fuelStops.push(path[i]);
                    console.log(`⛽ Planned fuel stop at (${path[i].x}, ${path[i].y}): ${fuelBefore} → ${currentFuel}`);
                }
            }
        }
        
        return fuelStops;
    }

    /**
     * Set conservative mode based on pellet availability
     */
    updateStrategy(pelletsCount: number): void {
        // Switch to conservative mode if pellets are scarce
        this.conservativeMode = pelletsCount < 10;
        
        if (this.conservativeMode) {
            console.log("⚠️ Switching to conservative fuel mode (few pellets available)");
        }
    }

    /**
     * Estimate if we can complete the journey
     */
    canReachOrigin(position: Position, currentFuel: number): boolean {
        const distanceToOrigin = manhattanDistance(position, { x: 0n, y: 0n });
        
        // Direct path possible?
        if (currentFuel >= distanceToOrigin) return true;
        
        // Can we reach origin via pellets?
        const pellets = this.gameState.getAllPellets();
        
        // Simple heuristic: check if there are pellets between us and origin
        const pelletsOnPath = pellets.filter(p => {
            const pelletDist = manhattanDistance(position, p.position);
            const pelletToOrigin = manhattanDistance(p.position, { x: 0n, y: 0n });
            
            // Pellet is reachable and gets us closer
            return pelletDist <= currentFuel && pelletToOrigin < distanceToOrigin;
        });
        
        return pelletsOnPath.length > 0;
    }

    /**
     * Get fuel status summary
     */
    getFuelStatus(currentFuel: number, position: Position): string {
        const distanceToOrigin = manhattanDistance(position, { x: 0n, y: 0n });
        const reachablePellets = this.getReachablePellets(position, currentFuel);
        
        if (currentFuel === 0 && reachablePellets.length === 0) {
            return "🚨 CRITICAL: Out of fuel with no pellets in range!";
        }
        
        if (currentFuel >= distanceToOrigin) {
            return `✅ Sufficient fuel (${currentFuel}/${distanceToOrigin} needed)`;
        }
        
        if (reachablePellets.length > 0) {
            return `⚠️ Low fuel (${currentFuel}), but ${reachablePellets.length} pellets reachable`;
        }
        
        return `⚠️ Low fuel (${currentFuel}/${distanceToOrigin} needed)`;
    }
}