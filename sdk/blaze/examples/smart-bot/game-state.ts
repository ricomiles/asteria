import { Provider } from "@blaze-cardano/sdk";
import { Address, AssetId, TransactionUnspentOutput } from "@blaze-cardano/core";
import { Data } from "@blaze-cardano/sdk";
import { PelletDatum, ShipDatum } from "../../src";
import { GameState, Pellet, Ship, Position, GAME_CONFIG, positionToKey } from "./types";

export class GameStateManager {
    private gameState: GameState;
    private provider: Provider;
    private pelletValidatorAddress: Address;
    private spacetimeValidatorAddress: Address;
    private fuelToken: AssetId;
    private shipyardPolicy: string;

    constructor(
        provider: Provider,
        pelletValidatorAddress: any,
        spacetimeValidatorAddress: any,
        fuelToken: AssetId,
        shipyardPolicy: string
    ) {
        this.provider = provider;
        this.pelletValidatorAddress = pelletValidatorAddress;
        this.spacetimeValidatorAddress = spacetimeValidatorAddress;
        this.fuelToken = fuelToken;
        this.shipyardPolicy = shipyardPolicy;
        
        this.gameState = {
            pellets: new Map(),
            ships: new Map(),
            config: GAME_CONFIG
        };
    }

    async updatePellets(): Promise<void> {
        console.log("🔍 Querying all pellets on the grid...");
        
        try {
            console.log("📍 Fetching pellets from validator address:", this.pelletValidatorAddress.toBech32())
            console.log("🔗 Fuel token:", this.fuelToken);
           
            const pelletUtxos = await this.provider.getUnspentOutputsWithAsset(
                this.pelletValidatorAddress,
                this.fuelToken
            );

            this.gameState.pellets.clear();
            
            for (const pelletUtxo of pelletUtxos) {
                const datum = pelletUtxo.output().datum()?.asInlineData();
                if (!datum) continue;

                const pelletDatum = Data.from(datum, PelletDatum);
                const position: Position = {
                    x: pelletDatum.pos_x,
                    y: pelletDatum.pos_y
                };

                let fuelAmount = 0n;
                pelletUtxo.output().amount().multiasset()?.forEach((value, asset) => {
                    if (AssetId.getPolicyId(asset) === AssetId.getPolicyId(this.fuelToken)) {
                        fuelAmount = value;
                    }
                });

                const pellet: Pellet = {
                    position,
                    fuel: fuelAmount,
                    utxo: pelletUtxo
                };

                this.gameState.pellets.set(positionToKey(position), pellet);
            }

            console.log(`📍 Found ${this.gameState.pellets.size} pellets on the grid`);
            this.logPelletDistribution();
        } catch (error) {
            console.error("❌ Error updating pellets:", error);
        }
    }

    async updateShips(): Promise<void> {
        console.log("🚀 Querying all ships on the grid...");
        
        try {
            // Query all UTXOs at spacetime address to find ships
            const shipUtxos = await this.provider.getUnspentOutputs(this.spacetimeValidatorAddress);
            
            this.gameState.ships.clear();
            
            for (const shipUtxo of shipUtxos) {
                // Check if this UTXO contains a ship token
                let hasShipToken = false;
                let shipTokenName = "";
                
                shipUtxo.output().amount().multiasset()?.forEach((value, asset) => {
                    if (AssetId.getPolicyId(asset).toLowerCase() === this.shipyardPolicy.toLowerCase()) {
                        const assetName = AssetId.getAssetName(asset);
                        // Check if it's a SHIP token (not PILOT)
                        if (assetName.startsWith("53484950")) { // "SHIP" in hex
                            hasShipToken = true;
                            shipTokenName = assetName;
                        }
                    }
                });

                if (!hasShipToken) continue;

                const datum = shipUtxo.output().datum()?.asInlineData();
                if (!datum) continue;

                const shipDatum = Data.from(datum, ShipDatum);
                const position: Position = {
                    x: shipDatum.pos_x,
                    y: shipDatum.pos_y
                };

                let fuelAmount = 0n;
                shipUtxo.output().amount().multiasset()?.forEach((value, asset) => {
                    if (AssetId.getPolicyId(asset) === AssetId.getPolicyId(this.fuelToken)) {
                        fuelAmount = value;
                    }
                });

                const ship: Ship = {
                    position,
                    fuel: fuelAmount,
                    tokenName: shipTokenName
                };

                this.gameState.ships.set(positionToKey(position), ship);
            }

            console.log(`🚢 Found ${this.gameState.ships.size} ships on the grid`);
        } catch (error) {
            console.error("❌ Error updating ships:", error);
        }
    }

    async updateGameState(): Promise<void> {
        await Promise.all([
            this.updatePellets(),
            this.updateShips()
        ]);
    }

    getPelletAt(position: Position): Pellet | undefined {
        return this.gameState.pellets.get(positionToKey(position));
    }

    getShipAt(position: Position): Ship | undefined {
        return this.gameState.ships.get(positionToKey(position));
    }

    getAllPellets(): Pellet[] {
        return Array.from(this.gameState.pellets.values());
    }

    getAllShips(): Ship[] {
        return Array.from(this.gameState.ships.values());
    }

    getPelletsWithinDistance(position: Position, maxDistance: number): Pellet[] {
        const pellets: Pellet[] = [];
        
        for (const pellet of this.gameState.pellets.values()) {
            const distance = this.calculateManhattanDistance(position, pellet.position);
            if (distance <= maxDistance) {
                pellets.push(pellet);
            }
        }
        
        return pellets.sort((a, b) => {
            const distA = this.calculateManhattanDistance(position, a.position);
            const distB = this.calculateManhattanDistance(position, b.position);
            return distA - distB;
        });
    }

    removePellet(position: Position): void {
        this.gameState.pellets.delete(positionToKey(position));
    }

    updateMyShip(position: Position, fuel: bigint): void {
        this.gameState.myShipPosition = position;
        this.gameState.myShipFuel = fuel;
    }

    getGameState(): GameState {
        return this.gameState;
    }

    private calculateManhattanDistance(a: Position, b: Position): number {
        return Number(this.abs(a.x - b.x) + this.abs(a.y - b.y));
    }

    private abs(n: bigint): bigint {
        return n < 0n ? -n : n;
    }

    private logPelletDistribution(): void {
        const quadrants = { q1: 0, q2: 0, q3: 0, q4: 0 };
        let closestToOrigin = Infinity;
        let closestPellet: Position | null = null;

        for (const pellet of this.gameState.pellets.values()) {
            const pos = pellet.position;
            
            // Determine quadrant
            if (pos.x >= 0n && pos.y >= 0n) quadrants.q1++;
            else if (pos.x < 0n && pos.y >= 0n) quadrants.q2++;
            else if (pos.x < 0n && pos.y < 0n) quadrants.q3++;
            else if (pos.x >= 0n && pos.y < 0n) quadrants.q4++;

            // Check if closest to origin
            const distance = this.calculateManhattanDistance(pos, { x: 0n, y: 0n });
            if (distance < closestToOrigin) {
                closestToOrigin = distance;
                closestPellet = pos;
            }
        }

        console.log(`📊 Pellet distribution by quadrant:`);
        console.log(`   Q1 (+x,+y): ${quadrants.q1} pellets`);
        console.log(`   Q2 (-x,+y): ${quadrants.q2} pellets`);
        console.log(`   Q3 (-x,-y): ${quadrants.q3} pellets`);
        console.log(`   Q4 (+x,-y): ${quadrants.q4} pellets`);
        
        if (closestPellet) {
            console.log(`   Closest to origin: (${closestPellet.x}, ${closestPellet.y}) at distance ${closestToOrigin}`);
        }
    }
}