import { Position, PathNode, Path, Pellet, GAME_CONFIG, positionToKey, manhattanDistance } from "./types";
import { GameStateManager } from "./game-state";

export class Pathfinder {
    private gameState: GameStateManager;

    constructor(gameState: GameStateManager) {
        this.gameState = gameState;
    }

    /**
     * A* pathfinding algorithm with fuel awareness
     */
    findPath(
        start: Position,
        goal: Position,
        initialFuel: number,
        considerPellets: boolean = true
    ): Path {
        console.log(`🔍 A* Debug: Starting pathfinding from (${start.x}, ${start.y}) to (${goal.x}, ${goal.y})`);
        console.log(`   Initial fuel: ${initialFuel}, Consider pellets: ${considerPellets}`);
        console.log(`   Direct distance: ${manhattanDistance(start, goal)}`);
        
        const openSet = new Map<string, PathNode>();
        const closedSet = new Set<string>();
        
        const startNode: PathNode = {
            position: start,
            g: 0,
            h: manhattanDistance(start, goal),
            f: manhattanDistance(start, goal),
            fuel: initialFuel
        };
        
        openSet.set(positionToKey(start), startNode);
        
        let iterations = 0;
        const maxIterations = 1000; // Prevent infinite loops
        
        while (openSet.size > 0 && iterations < maxIterations) {
            iterations++;
            
            // Get node with lowest f score
            let current: PathNode | null = null;
            let currentKey = "";
            
            for (const [key, node] of openSet) {
                if (!current || node.f < current.f) {
                    current = node;
                    currentKey = key;
                }
            }
            
            if (!current) {
                console.log(`🔍 A* Debug: No current node found, breaking`);
                break;
            }
            
            // Check if we reached the goal
            if (current.position.x === goal.x && current.position.y === goal.y) {
                console.log(`🎯 A* Debug: Goal reached in ${iterations} iterations!`);
                return this.reconstructPath(current);
            }
            
            openSet.delete(currentKey);
            closedSet.add(currentKey);
            
            // Debug current position
            if (iterations % 100 === 0 || iterations <= 5) {
                console.log(`🔍 A* Debug: Iteration ${iterations}, at (${current.position.x}, ${current.position.y}), fuel: ${current.fuel}, f: ${current.f}`);
            }
            
            // Explore neighbors
            const neighbors = this.getNeighbors(current.position);
            
            for (const neighborPos of neighbors) {
                const neighborKey = positionToKey(neighborPos);
                
                if (closedSet.has(neighborKey)) continue;
                
                // Calculate fuel at this position
                let fuelAtNeighbor = current.fuel - 1;
                
                // Check if we can't reach this neighbor due to fuel
                if (fuelAtNeighbor < 0) {
                    if (iterations <= 5) console.log(`🔍 A* Debug: Skipping neighbor (${neighborPos.x}, ${neighborPos.y}) - negative fuel: ${fuelAtNeighbor}`);
                    continue;
                }
                
                // Check for pellet at this position
                let foundPellet = false;
                if (considerPellets) {
                    const pellet = this.gameState.getPelletAt(neighborPos);
                    if (pellet) {
                        const fuelBefore = fuelAtNeighbor;
                        // Refuel at pellet
                        fuelAtNeighbor = Math.min(
                            GAME_CONFIG.maxShipFuel,
                            fuelAtNeighbor + Number(pellet.fuel)
                        );
                        foundPellet = true;
                        if (iterations <= 5) console.log(`🔍 A* Debug: Found pellet at (${neighborPos.x}, ${neighborPos.y}): ${fuelBefore} + ${pellet.fuel} = ${fuelAtNeighbor} fuel`);
                    }
                }
                
                // Check if we have enough fuel to continue from here
                const distanceToGoal = manhattanDistance(neighborPos, goal);
                const hasPathThroughPellets = this.hasPelletOnPath(neighborPos, goal, fuelAtNeighbor);
                
                if (fuelAtNeighbor < distanceToGoal && !hasPathThroughPellets) {
                    // This is the critical rejection logic - let's debug it
                    if (iterations <= 5) {
                        console.log(`🔍 A* Debug: REJECTING neighbor (${neighborPos.x}, ${neighborPos.y})`);
                        console.log(`   Fuel at neighbor: ${fuelAtNeighbor}`);
                        console.log(`   Distance to goal: ${distanceToGoal}`);
                        console.log(`   Has pellet on path: ${hasPathThroughPellets}`);
                        console.log(`   Found pellet here: ${foundPellet}`);
                    }
                    continue;
                } else {
                    if (iterations <= 5) {
                        console.log(`🔍 A* Debug: ACCEPTING neighbor (${neighborPos.x}, ${neighborPos.y})`);
                        console.log(`   Fuel at neighbor: ${fuelAtNeighbor}`);
                        console.log(`   Distance to goal: ${distanceToGoal}`);
                        console.log(`   Has pellet on path: ${hasPathThroughPellets}`);
                    }
                }
                
                const tentativeG = current.g + 1;
                
                const existingNode = openSet.get(neighborKey);
                if (existingNode && tentativeG >= existingNode.g) {
                    continue;
                }
                
                const neighborNode: PathNode = {
                    position: neighborPos,
                    g: tentativeG,
                    h: distanceToGoal,
                    f: tentativeG + distanceToGoal,
                    parent: current,
                    fuel: fuelAtNeighbor
                };
                
                openSet.set(neighborKey, neighborNode);
            }
        }
        
        // No path found
        console.log(`❌ A* Debug: Path finding failed after ${iterations} iterations`);
        console.log(`   Open set size: ${openSet.size}`);
        console.log(`   Closed set size: ${closedSet.size}`);
        console.log(`   Max iterations: ${maxIterations}`);
        
        if (iterations >= maxIterations) {
            console.log(`❌ A* Debug: Hit max iterations limit - possible infinite loop`);
        }
        
        return {
            nodes: [],
            totalCost: Infinity,
            fuelStops: [],
            success: false
        };
    }

    /**
     * Find path with mandatory refueling stops
     */
    findPathWithRefueling(
        start: Position,
        goal: Position,
        initialFuel: number
    ): Path {
        // First try direct path
        const directPath = this.findPath(start, goal, initialFuel, true);
        if (directPath.success) {
            return directPath;
        }
        
        // If direct path fails, find path through pellets
        const pellets = this.gameState.getAllPellets();
        const reachablePellets = pellets.filter(p => 
            manhattanDistance(start, p.position) <= initialFuel
        );
        
        if (reachablePellets.length === 0) {
            return directPath; // No better option
        }
        
        // Try path through each reachable pellet
        let bestPath: Path = directPath;
        let bestCost = Infinity;
        
        for (const pellet of reachablePellets) {
            // Path to pellet
            const pathToPellet = this.findPath(start, pellet.position, initialFuel, false);
            if (!pathToPellet.success) continue;
            
            // Calculate fuel after reaching pellet
            const fuelAtPellet = Math.min(
                GAME_CONFIG.maxShipFuel,
                initialFuel - pathToPellet.totalCost + Number(pellet.fuel)
            );
            
            // Path from pellet to goal
            const pathFromPellet = this.findPath(pellet.position, goal, fuelAtPellet, true);
            if (!pathFromPellet.success) continue;
            
            const totalCost = pathToPellet.totalCost + pathFromPellet.totalCost;
            
            if (totalCost < bestCost) {
                bestCost = totalCost;
                bestPath = {
                    nodes: [...pathToPellet.nodes.slice(0, -1), ...pathFromPellet.nodes],
                    totalCost,
                    fuelStops: [pellet.position, ...pathFromPellet.fuelStops],
                    success: true
                };
            }
        }
        
        return bestPath;
    }

    /**
     * Simulate a complete path to verify it's possible
     */
    simulatePath(path: Position[], initialFuel: number): boolean {
        let fuel = initialFuel;
        
        for (let i = 1; i < path.length; i++) {
            fuel -= 1; // Move cost
            
            if (fuel < 0) return false;
            
            // Check for pellet at current position
            const pellet = this.gameState.getPelletAt(path[i]);
            if (pellet) {
                fuel = Math.min(GAME_CONFIG.maxShipFuel, fuel + Number(pellet.fuel));
            }
        }
        
        return true;
    }

    private getNeighbors(position: Position): Position[] {
        const neighbors: Position[] = [];
        const moves = [
            { dx: 1n, dy: 0n },   // Right
            { dx: -1n, dy: 0n },  // Left
            { dx: 0n, dy: 1n },   // Up
            { dx: 0n, dy: -1n },  // Down
            { dx: 1n, dy: 1n },   // Diagonal UR
            { dx: -1n, dy: 1n },  // Diagonal UL
            { dx: 1n, dy: -1n },  // Diagonal DR
            { dx: -1n, dy: -1n }  // Diagonal DL
        ];
        
        for (const move of moves) {
            // Skip diagonal moves if we're not moving diagonally toward origin
            if (move.dx !== 0n && move.dy !== 0n) {
                const towardOriginX = position.x !== 0n ? -position.x / this.abs(position.x) : 0n;
                const towardOriginY = position.y !== 0n ? -position.y / this.abs(position.y) : 0n;
                
                // Only allow diagonal if it moves toward origin in both dimensions
                if (move.dx !== towardOriginX || move.dy !== towardOriginY) {
                    continue;
                }
            }
            
            neighbors.push({
                x: position.x + move.dx,
                y: position.y + move.dy
            });
        }
        
        return neighbors;
    }

    private reconstructPath(node: PathNode): Path {
        const nodes: Position[] = [];
        const fuelStops: Position[] = [];
        let current: PathNode | undefined = node;
        let totalCost = 0;
        
        while (current) {
            nodes.unshift(current.position);
            
            // Check if this position has a pellet
            const pellet = this.gameState.getPelletAt(current.position);
            if (pellet && current.parent) { // Don't count start position as fuel stop
                fuelStops.unshift(current.position);
            }
            
            if (current.parent) {
                totalCost++;
            }
            
            current = current.parent;
        }
        
        return {
            nodes,
            totalCost,
            fuelStops,
            success: true
        };
    }

    private hasPelletOnPath(from: Position, to: Position, currentFuel: number): boolean {
        const pellets = this.gameState.getAllPellets();
        
        // Debug logging for first few calls
        const debugThis = pellets.length > 0;
        if (debugThis) {
            console.log(`🔍 hasPelletOnPath: from (${from.x}, ${from.y}) to (${to.x}, ${to.y}) with fuel ${currentFuel}`);
            console.log(`   Available pellets: ${pellets.length}`);
        }
        
        for (const pellet of pellets) {
            const distToPellet = manhattanDistance(from, pellet.position);
            const distFromPelletToGoal = manhattanDistance(pellet.position, to);
            
            if (debugThis && pellets.indexOf(pellet) < 3) {
                console.log(`   Checking pellet at (${pellet.position.x}, ${pellet.position.y}) with ${pellet.fuel} fuel`);
                console.log(`   Distance to pellet: ${distToPellet}, fuel needed: ${distToPellet}, have: ${currentFuel}`);
            }
            
            // Can we reach this pellet?
            if (distToPellet <= currentFuel) {
                // Calculate fuel after reaching and refueling at this pellet
                const fuelAfterMove = currentFuel - distToPellet;
                const maxRefuel = GAME_CONFIG.maxShipFuel - fuelAfterMove;
                const actualRefuel = Math.min(Number(pellet.fuel), maxRefuel);
                const fuelAfterReachingPellet = fuelAfterMove + actualRefuel;
                
                if (debugThis && pellets.indexOf(pellet) < 3) {
                    console.log(`   Fuel after reaching: ${fuelAfterMove} + ${actualRefuel} = ${fuelAfterReachingPellet}`);
                    console.log(`   Distance from pellet to goal: ${distFromPelletToGoal}`);
                    console.log(`   Can reach goal? ${fuelAfterReachingPellet >= distFromPelletToGoal}`);
                }
                
                // Can we reach the goal from this pellet?
                if (fuelAfterReachingPellet >= distFromPelletToGoal) {
                    if (debugThis) {
                        console.log(`   ✅ Found viable path through pellet at (${pellet.position.x}, ${pellet.position.y})`);
                    }
                    return true;
                }
            }
        }
        
        if (debugThis) {
            console.log(`   ❌ No viable pellet path found`);
        }
        return false;
    }

    private abs(n: bigint): bigint {
        return n < 0n ? -n : n;
    }

    /**
     * Calculate the optimal next move toward a goal
     */
    calculateNextMove(from: Position, to: Position): { dx: bigint, dy: bigint } {
        let dx = 0n;
        let dy = 0n;
        
        if (from.x !== to.x) {
            dx = to.x > from.x ? 1n : -1n;
        }
        
        if (from.y !== to.y) {
            dy = to.y > from.y ? 1n : -1n;
        }
        
        return { dx, dy };
    }
}