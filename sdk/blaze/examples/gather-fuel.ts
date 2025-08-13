import { GameIdentifier, OutRef } from "../src/types";
import { gatherFuel } from "../src";
import { Unwrapped } from "@blaze-cardano/ogmios";
import { Kupmios } from "@blaze-cardano/sdk";

async function main() {
    const address =
        "addr1qy45nexa87ms28jxe48rqs5g36sgrjej9n4fp09h9ftdxr60053vjzxn37ayva7d6fghzfeg8g20axhzjvtd4awz5g5s32wyqz";

    const provider = new Kupmios(
        "https://kupo1shqzdry3gh2dsgdy3lg.mainnet-v2.kupo-m1.demeter.run",
        await Unwrapped.Ogmios.new("https://ogmios199hxc0fnr4wpjg8cp37.mainnet-v6.ogmios-m1.demeter.run")
    );

    const ship_utxo: OutRef = {
        tx_hash:
            "bbe5c251d13317afbf1f2615111bac1b07ed5c1b791e58e78adb3a517b945162",
        tx_index: 0n,
    };

    const pellet_utxo: OutRef = {
        tx_hash:
            "9dc3bc8c36e0785e622360cf9e9ff6a508a08e54ad1d273b94d646ad71943209",
        tx_index: 33n,
    };

    const spacetime_script_reference: OutRef = {
        tx_hash:
            "3d308c0f3deb1eff764cbb765452c53d30704748681d7acd61c7775aeb8a8e46",
        tx_index: 1n,
    };

    const pellet_script_reference: OutRef = {
        tx_hash:
            "3d308c0f3deb1eff764cbb765452c53d30704748681d7acd61c7775aeb8a8e46",
        tx_index: 2n,
    };


    const gather_fuel_identifier: GameIdentifier = {
        ship_utxo,
        pellet_utxo,
        spacetime_script_reference,
        pellet_script_reference,
    };

    const tx = await gatherFuel(
        provider,
        address,
        gather_fuel_identifier,
    );

    return tx;
}

main().then((tx) => {
    console.log(tx.toCbor());
});
