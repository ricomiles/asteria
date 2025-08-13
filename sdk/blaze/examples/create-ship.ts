import { Kupmios } from "@blaze-cardano/sdk";
import { createShip } from "../src";
import { GameIdentifier, OutRef } from "../src/types";
import { Unwrapped } from "@blaze-cardano/ogmios";

async function main() {
    const address =
        "addr1qy45nexa87ms28jxe48rqs5g36sgrjej9n4fp09h9ftdxr60053vjzxn37ayva7d6fghzfeg8g20axhzjvtd4awz5g5s32wyqz";

    const provider = new Kupmios(
        "https://kupo1shqzdry3gh2dsgdy3lg.mainnet-v2.kupo-m1.demeter.run",
        await Unwrapped.Ogmios.new("https://ogmios199hxc0fnr4wpjg8cp37.mainnet-v6.ogmios-m1.demeter.run")
    );

    const spacetime_script_reference: OutRef = {
        tx_hash:
            "3d308c0f3deb1eff764cbb765452c53d30704748681d7acd61c7775aeb8a8e46",
        tx_index: 0n,
    };

    const pellet_script_reference: OutRef = {
        tx_hash:
            "3d308c0f3deb1eff764cbb765452c53d30704748681d7acd61c7775aeb8a8e46",
        tx_index: 2n,
    };

    const asteria_script_reference: OutRef = {
        tx_hash:
            "3d308c0f3deb1eff764cbb765452c53d30704748681d7acd61c7775aeb8a8e46",
        tx_index: 1n,
    };

    const pos_x = 27n;
    const pos_y = 27n;

    const gameIdentifier: GameIdentifier = {
        spacetime_script_reference,
        pellet_script_reference,
        asteria_script_reference,
    };

    const tx = await createShip(
        provider,
        address,
        gameIdentifier,
        pos_x,
        pos_y,
    );

    return tx;
}

main().then((tx) => {
    console.log(tx.toCbor());
});