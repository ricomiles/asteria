import { TransactionUnspentOutput } from "@blaze-cardano/core";

export interface Position {
    x: bigint;
    y: bigint;
}

export interface Pellet {
    position: Position;
    fuel: bigint;
    utxo: TransactionUnspentOutput;
}

export interface Ship {
    position: Position;
    fuel: bigint;
    tokenName: string;
}

export interface PathNode {
    position: Position;
    g: number; // Cost from start
    h: number; // Heuristic to goal
    f: number; // Total score (g + h)
    parent?: PathNode;
    fuel: number;
}

export interface Path {
    nodes: Position[];
    totalCost: number;
    fuelStops: Position[];
    success: boolean;
}

export interface SpawnCandidate {
    position: Position;
    score: number;
    guaranteedPath: boolean;
    pathToOrigin?: Path;
    nearbyPellets: number;
    totalMoves: number;
}

export interface GameConfig {
    maxSpeed: { distance: number; time: number };
    maxShipFuel: number;
    fuelPerStep: number;
    initialFuel: number;
    minAsteriaDistance: number;
    shipMintLovelaceFee: number;
    maxAsteriaMining: number;
}

export interface GameState {
    pellets: Map<string, Pellet>;
    ships: Map<string, Ship>;
    myShipPosition?: Position;
    myShipFuel?: bigint;
    config: GameConfig;
}

export const GAME_CONFIG: GameConfig = {
    maxSpeed: { distance: 1, time: 12096000 },
    maxShipFuel: 5,
    fuelPerStep: 1,
    initialFuel: 5,
    minAsteriaDistance: 50,
    shipMintLovelaceFee: 1000000,
    maxAsteriaMining: 50
};

export function positionToKey(pos: Position): string {
    return `${pos.x},${pos.y}`;
}

export function keyToPosition(key: string): Position {
    const [x, y] = key.split(',').map(n => BigInt(n));
    return { x, y };
}

export function manhattanDistance(a: Position, b: Position): number {
    return Number(abs(a.x - b.x) + abs(a.y - b.y));
}

function abs(n: bigint): bigint {
    return n < 0n ? -n : n;
}