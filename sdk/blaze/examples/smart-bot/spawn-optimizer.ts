import { Position, SpawnCandidate, Pellet, Ship, GAME_CONFIG, manhattanDistance } from "./types";
import { GameStateManager } from "./game-state";
import { Pathfinder } from "./pathfinding";

export class SpawnOptimizer {
    private gameState: GameStateManager;
    private pathfinder: Pathfinder;

    constructor(gameState: GameStateManager) {
        this.gameState = gameState;
        this.pathfinder = new Pathfinder(gameState);
    }

    /**
     * Find the optimal spawn position for the ship
     */
    async findOptimalSpawnPosition(): Promise<SpawnCandidate | null> {
        console.log("🎯 Calculating optimal spawn position with path-first strategy...");
        
        const candidates = this.generateSpawnCandidates();
        console.log(`🔄 Evaluating ${candidates.length} spawn candidates...`);
        
        const evaluatedCandidates: SpawnCandidate[] = [];
        let pathsFound = 0;
        let totalEvaluated = 0;
        
        // Evaluate all candidates and collect both successful and failed ones
        for (const position of candidates) {
            totalEvaluated++;
            
            if (totalEvaluated % 50 === 0) {
                console.log(`📊 Progress: ${totalEvaluated}/${candidates.length} evaluated, ${pathsFound} viable paths found`);
            }
            
            const candidate = await this.evaluateSpawnPosition(position);
            
            if (candidate.guaranteedPath) {
                evaluatedCandidates.push(candidate);
                pathsFound++;
            }
            
            // Early success: if we find several good candidates, we can be more selective
            if (pathsFound >= 10 && totalEvaluated >= 100) {
                console.log(`🎯 Found ${pathsFound} viable paths in first ${totalEvaluated} candidates, selecting best ones...`);
                break;
            }
        }
        
        console.log(`📈 Final results: ${pathsFound} viable paths found out of ${totalEvaluated} positions evaluated`);
        
        if (evaluatedCandidates.length === 0) {
            console.log("❌ No spawn positions with guaranteed paths found in primary search!");
            console.log("🔄 Expanding search with fallback strategy...");
            return this.findFallbackSpawnPosition();
        }
        
        // Sort by score (higher is better)
        evaluatedCandidates.sort((a, b) => b.score - a.score);
        
        // Show top candidates
        console.log(`🏆 Top ${Math.min(5, evaluatedCandidates.length)} spawn candidates:`);
        for (let i = 0; i < Math.min(5, evaluatedCandidates.length); i++) {
            const candidate = evaluatedCandidates[i];
            console.log(`   ${i + 1}. (${candidate.position.x}, ${candidate.position.y}) - Score: ${candidate.score.toFixed(0)}, Moves: ${candidate.totalMoves}, Fuel stops: ${candidate.pathToOrigin?.fuelStops.length || 0}`);
        }
        
        const best = evaluatedCandidates[0];
        console.log(`✅ Selected optimal spawn: (${best.position.x}, ${best.position.y})`);
        console.log(`   🎯 Score: ${best.score.toFixed(0)}`);
        console.log(`   📏 Total moves to origin: ${best.totalMoves}`);  
        console.log(`   ⛽ Fuel stops needed: ${best.pathToOrigin?.fuelStops.length || 0}`);
        console.log(`   📍 Nearby pellets (20 radius): ${best.nearbyPellets}`);
        
        return best;
    }

    /**
     * Generate potential spawn positions with focus on path viability
     */
    private generateSpawnCandidates(): Position[] {
        const candidates: Position[] = [];
        const minDist = GAME_CONFIG.minAsteriaDistance;
        const maxDist = Math.min(200, minDist * 3); // Expand search area significantly
        
        console.log(`🔍 Generating spawn candidates from distance ${minDist} to ${maxDist}...`);
        
        // Get pellet distribution to focus search
        const pellets = this.gameState.getAllPellets();
        console.log(`📍 Working with ${pellets.length} available pellets`);
        
        // Strategy 1: Positions near pellet clusters (most important)
        const pelletBasedCandidates = this.generatePelletBasedCandidates(pellets, minDist);
        candidates.push(...pelletBasedCandidates);
        console.log(`🎯 Added ${pelletBasedCandidates.length} pellet-based candidates`);
        
        // Strategy 2: Systematic grid around minimum distance circle
        const gridCandidates = this.generateSystematicGrid(minDist, maxDist);
        candidates.push(...gridCandidates);
        console.log(`📐 Added ${gridCandidates.length} systematic grid candidates`);
        
        // Strategy 3: Radial sampling at multiple distances
        const radialCandidates = this.generateRadialCandidates(minDist, maxDist);
        candidates.push(...radialCandidates);
        console.log(`🌀 Added ${radialCandidates.length} radial candidates`);
        
        const uniqueCandidates = this.deduplicatePositions(candidates);
        console.log(`✅ Total unique spawn candidates: ${uniqueCandidates.length}`);
        
        return uniqueCandidates;
    }

    /**
     * Generate candidates based on pellet positions - key strategy for path viability
     */
    private generatePelletBasedCandidates(pellets: any[], minDist: number): Position[] {
        const candidates: Position[] = [];
        const origin = { x: 0n, y: 0n };
        
        console.log(`🔍 Analyzing ${pellets.length} pellets for spawn candidate generation...`);
        
        // Strategy: Find spawn positions that can create multi-hop paths through pellet chain
        // Step 1: Find pellets that can reach origin directly
        const pelletsThatReachOrigin = pellets.filter(pellet => {
            const distToOrigin = manhattanDistance(pellet.position, origin);
            const pelletFuel = Number(pellet.fuel);
            return distToOrigin <= pelletFuel; // Pellet has enough fuel to reach origin
        });
        
        console.log(`🎯 Found ${pelletsThatReachOrigin.length} pellets that can reach origin directly`);
        
        // Step 2: For each origin-reachable pellet, find other pellets that can reach it
        const pelletPairs: Array<{first: any, second: any}> = [];
        
        for (const targetPellet of pelletsThatReachOrigin.slice(0, 20)) { // Limit for performance
            for (const sourcePellet of pellets) {
                if (sourcePellet === targetPellet) continue;
                
                const distBetweenPellets = manhattanDistance(sourcePellet.position, targetPellet.position);
                const sourceFuel = Number(sourcePellet.fuel);
                
                // Can this source pellet reach the target pellet?
                if (distBetweenPellets <= sourceFuel) {
                    pelletPairs.push({ first: sourcePellet, second: targetPellet });
                }
            }
        }
        
        console.log(`🔗 Found ${pelletPairs.length} viable pellet chain pairs`);
        
        // Step 3: Generate spawn positions that can reach the first pellet in viable chains
        for (const pair of pelletPairs.slice(0, 100)) { // Limit candidates
            const firstPellet = pair.first;
            const firstPelletFuel = Number(firstPellet.fuel);
            
            // Generate spawn positions around the first pellet
            const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
            
            for (const angle of angles) {
                // Test distances from minDist up to what's reachable with initial fuel
                for (let dist = minDist; dist <= minDist + 20; dist += 3) {
                    const rad = (angle * Math.PI) / 180;
                    const x = BigInt(Math.round(dist * Math.cos(rad)));
                    const y = BigInt(Math.round(dist * Math.sin(rad)));
                    
                    const spawnPos = { x, y };
                    const distToOrigin = manhattanDistance(spawnPos, origin);
                    const distToFirstPellet = manhattanDistance(spawnPos, firstPellet.position);
                    
                    // Check constraints:
                    // 1. Must be at least minDist from origin
                    // 2. Must be reachable from spawn to first pellet with initial fuel
                    if (distToOrigin >= minDist && distToFirstPellet <= GAME_CONFIG.initialFuel) {
                        candidates.push(spawnPos);
                        
                        // Debug: Show what we found
                        if (candidates.length <= 5) {
                            console.log(`🎯 Pellet-based spawn candidate: (${x}, ${y})`);
                            console.log(`   → Distance to origin: ${distToOrigin}`);
                            console.log(`   → Distance to first pellet: ${distToFirstPellet} (fuel: ${firstPelletFuel})`);
                            console.log(`   → Chain: spawn→pellet(${firstPellet.position.x},${firstPellet.position.y})→pellet(${pair.second.position.x},${pair.second.position.y})→origin`);
                        }
                    }
                }
            }
        }
        
        console.log(`✅ Generated ${candidates.length} pellet-based spawn candidates`);
        return candidates;
    }

    /**
     * Generate systematic grid of candidates
     */
    private generateSystematicGrid(minDist: number, maxDist: number): Position[] {
        const candidates: Position[] = [];
        const step = 5; // Grid spacing
        
        for (let x = -maxDist; x <= maxDist; x += step) {
            for (let y = -maxDist; y <= maxDist; y += step) {
                const pos = { x: BigInt(x), y: BigInt(y) };
                const dist = manhattanDistance(pos, { x: 0n, y: 0n });
                
                if (dist >= minDist && dist <= maxDist) {
                    candidates.push(pos);
                }
            }
        }
        
        return candidates;
    }

    /**
     * Generate radial candidates at multiple distances
     */
    private generateRadialCandidates(minDist: number, maxDist: number): Position[] {
        const candidates: Position[] = [];
        
        // Multiple distance rings
        for (let dist = minDist; dist <= maxDist; dist += 10) {
            // Denser sampling for closer distances
            const angleStep = dist <= minDist + 20 ? 15 : 30;
            
            for (let angle = 0; angle < 360; angle += angleStep) {
                const rad = (angle * Math.PI) / 180;
                const x = BigInt(Math.round(dist * Math.cos(rad)));
                const y = BigInt(Math.round(dist * Math.sin(rad)));
                
                candidates.push({ x, y });
            }
        }
        
        return candidates;
    }

    /**
     * Evaluate a spawn position
     */
    private async evaluateSpawnPosition(position: Position): Promise<SpawnCandidate> {
        const origin: Position = { x: 0n, y: 0n };
        
        // Find path to origin
        const path = this.pathfinder.findPathWithRefueling(
            position,
            origin,
            GAME_CONFIG.initialFuel
        );
        
        // Count nearby pellets
        const nearbyPellets = this.gameState.getPelletsWithinDistance(position, 10).length;
        
        // Calculate competition factor
        const nearbyShips = this.countNearbyShips(position, 15);
        
        // Calculate score
        const score = this.calculateSpawnScore(
            position,
            path,
            nearbyPellets,
            nearbyShips
        );
        
        return {
            position,
            score,
            guaranteedPath: path.success,
            pathToOrigin: path,
            nearbyPellets,
            totalMoves: path.totalCost
        };
    }

    /**
     * Calculate score for a spawn position - prioritizing path viability over distance
     */
    private calculateSpawnScore(
        position: Position,
        path: any,
        nearbyPellets: number,
        nearbyShips: number
    ): number {
        // Guaranteed path is ESSENTIAL - no path = impossible spawn
        if (!path.success) {
            console.log(`❌ No path from (${position.x}, ${position.y}) - score: -Infinity`);
            return -Infinity;
        }
        
        const distanceToOrigin = this.calculateDistance(position, { x: 0n, y: 0n });
        
        // NEW WEIGHTS: Heavily prioritize path viability and efficiency
        const weights = {
            pathSuccess: 1000,    // MASSIVE bonus for having any path at all
            pathEfficiency: 500,  // Major bonus for efficient paths  
            pathSafety: 300,      // Bonus for paths with multiple fuel stops
            pelletAccess: 200,    // Good to have nearby pellets
            distance: -50,        // Minor penalty for distance (much reduced)
            competition: -100     // Avoid crowded areas
        };
        
        // Path success bonus (having a path at all is huge)
        const pathSuccessScore = 1.0;
        
        // Calculate path efficiency (ideal distance / actual path length)
        // Cap at 1.0 to prevent over-rewarding
        const pathEfficiency = Math.min(1.0, distanceToOrigin / path.totalCost);
        
        // Path safety - reward paths with fuel stops (more robust)
        const fuelStops = path.fuelStops ? path.fuelStops.length : 0;
        const pathSafety = Math.min(1.0, fuelStops / 3); // Up to 3 fuel stops is very safe
        
        // Pellet accessibility score (0-1) - increased nearby search
        const extendedNearbyPellets = this.gameState.getPelletsWithinDistance(position, 20).length;
        const pelletScore = Math.min(1.0, extendedNearbyPellets / 10);
        
        // Competition score (0-1, where 0 is many ships, 1 is no ships)
        const competitionScore = Math.max(0, 1 - (nearbyShips / 3));
        
        // Distance penalty (normalized, much smaller impact)
        const distancePenalty = distanceToOrigin / 200; // Reduced impact
        
        const totalScore = 
            weights.pathSuccess * pathSuccessScore +
            weights.pathEfficiency * pathEfficiency +
            weights.pathSafety * pathSafety +
            weights.pelletAccess * pelletScore +
            weights.distance * distancePenalty +
            weights.competition * competitionScore;
        
        console.log(`📊 Spawn (${position.x}, ${position.y}): score=${totalScore.toFixed(0)} (path=${path.success}, eff=${pathEfficiency.toFixed(2)}, stops=${fuelStops}, pellets=${extendedNearbyPellets})`);
        
        return totalScore;
    }

    /**
     * Fallback strategy when no guaranteed path is found
     */
    private async findFallbackSpawnPosition(): Promise<SpawnCandidate | null> {
        console.log("🔄 Using fallback spawn strategy...");
        
        // Find the position with most pellets nearby
        const candidates = this.generateSpawnCandidates();
        let bestCandidate: SpawnCandidate | null = null;
        let maxPellets = 0;
        
        for (const position of candidates) {
            const nearbyPellets = this.gameState.getPelletsWithinDistance(position, 15).length;
            
            if (nearbyPellets > maxPellets) {
                maxPellets = nearbyPellets;
                bestCandidate = {
                    position,
                    score: nearbyPellets,
                    guaranteedPath: false,
                    nearbyPellets,
                    totalMoves: this.calculateDistance(position, { x: 0n, y: 0n })
                };
            }
        }
        
        if (bestCandidate) {
            console.log(`📍 Fallback spawn: (${bestCandidate.position.x}, ${bestCandidate.position.y})`);
            console.log(`   Nearby pellets: ${bestCandidate.nearbyPellets}`);
        }
        
        return bestCandidate;
    }

    /**
     * Calculate pellet density by quadrant
     */
    private calculatePelletDensity(pellets: Pellet[]): Record<string, number> {
        const quadrants = { q1: 0, q2: 0, q3: 0, q4: 0 };
        
        for (const pellet of pellets) {
            const pos = pellet.position;
            if (pos.x >= 0n && pos.y >= 0n) quadrants.q1++;
            else if (pos.x < 0n && pos.y >= 0n) quadrants.q2++;
            else if (pos.x < 0n && pos.y < 0n) quadrants.q3++;
            else if (pos.x >= 0n && pos.y < 0n) quadrants.q4++;
        }
        
        const total = pellets.length || 1;
        return {
            q1: quadrants.q1 / total,
            q2: quadrants.q2 / total,
            q3: quadrants.q3 / total,
            q4: quadrants.q4 / total
        };
    }

    /**
     * Generate extra candidates for high-density quadrants
     */
    private generateQuadrantCandidates(quadrant: string, minDist: number): Position[] {
        const candidates: Position[] = [];
        const angleRanges: Record<string, [number, number]> = {
            q1: [0, 90],
            q2: [90, 180],
            q3: [180, 270],
            q4: [270, 360]
        };
        
        const [startAngle, endAngle] = angleRanges[quadrant];
        
        for (let angle = startAngle; angle <= endAngle; angle += 15) {
            const rad = (angle * Math.PI) / 180;
            const x = BigInt(Math.round(minDist * Math.cos(rad)));
            const y = BigInt(Math.round(minDist * Math.sin(rad)));
            
            if (this.calculateDistance({ x, y }, { x: 0n, y: 0n }) >= minDist) {
                candidates.push({ x, y });
            }
        }
        
        return candidates;
    }

    /**
     * Count ships near a position
     */
    private countNearbyShips(position: Position, radius: number): number {
        const ships = this.gameState.getAllShips();
        let count = 0;
        
        for (const ship of ships) {
            if (this.calculateDistance(position, ship.position) <= radius) {
                count++;
            }
        }
        
        return count;
    }

    /**
     * Remove duplicate positions
     */
    private deduplicatePositions(positions: Position[]): Position[] {
        const seen = new Set<string>();
        const unique: Position[] = [];
        
        for (const pos of positions) {
            const key = `${pos.x},${pos.y}`;
            if (!seen.has(key)) {
                seen.add(key);
                unique.push(pos);
            }
        }
        
        return unique;
    }

    private calculateDistance(a: Position, b: Position): number {
        return Number(this.abs(a.x - b.x) + this.abs(a.y - b.y));
    }

    private abs(n: bigint): bigint {
        return n < 0n ? -n : n;
    }
}