import { Unwrapped } from "@blaze-cardano/ogmios";
import { Kupmios } from "@blaze-cardano/sdk";
import { moveShip } from "../src";
import { OutRef, GameIdentifier } from "../src/types";

async function main() {
    const address =
        "addr1qy45nexa87ms28jxe48rqs5g36sgrjej9n4fp09h9ftdxr60053vjzxn37ayva7d6fghzfeg8g20axhzjvtd4awz5g5s32wyqz";

    const provider = new Kupmios(
        "https://kupo1shqzdry3gh2dsgdy3lg.mainnet-v2.kupo-m1.demeter.run",
        await Unwrapped.Ogmios.new("https://ogmios199hxc0fnr4wpjg8cp37.mainnet-v6.ogmios-m1.demeter.run")
    );

    const ship_utxo: OutRef = {
        tx_hash:
            "cf6a3f68140328366e4a35ec6520d78a3a95ac8485b2d1fca6c98d605f181073",
        tx_index: 0n,
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

    const delta_x = 0n;
    const delta_y = -1n

    const move_ship_identifier: GameIdentifier = {
        ship_utxo,
        spacetime_script_reference,
        pellet_script_reference,
    };

    const tx = await moveShip(
        provider,
        address,
        move_ship_identifier,
        delta_x,
        delta_y,
    );

    return tx;
}

main().then((tx) => {
    console.log(tx.toCbor());
});