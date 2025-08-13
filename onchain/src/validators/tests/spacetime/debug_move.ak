use aiken/collection/dict
use aiken/collection/list
use aiken/interval
use aiken/math/rational
use asteria/types.{MoveShip, ShipDatum}
use asteria/utils
use cardano/address.{Address, Script}
use cardano/assets.{from_asset, quantity_of, tokens, without_lovelace, add}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}

test debug_move_ship() {
  // Values from the CBOR diagnostic
  let delta_x = 0
  let delta_y = -1
  
  // Input ship datum (needs to be inferred from the transaction)
  let input_ship_datum = ShipDatum {
    pos_x: 25,
    pos_y: 25,  // Assuming this since output is (25, 24) after moving (0, -1)
    ship_token_name: #"534849503136",  // SHIP16
    pilot_token_name: #"50494c4f543136",  // PILOT16
    last_move_latest_time: 1830176520700,  // Some earlier time
  }
  
  // Output ship datum from CBOR
  let output_ship_datum = ShipDatum {
    pos_x: 25,
    pos_y: 24,
    ship_token_name: #"534849503136",
    pilot_token_name: #"50494c4f543136", 
    last_move_latest_time: 1830176521000,
  }
  
  // Transaction validity range from new CBOR
  // Slots 163520829 to 163521129 
  // These need to be converted to POSIX ms as the validator sees them
  // Based on previous analysis, Cardano adds an offset
  let tx_earliest_time = 1830176829000  // Lower bound slot 163520829 as POSIX ms
  let tx_latest_time = 1830177129000    // Upper bound slot 163521129 as POSIX ms
  
  // Check 1: must_respect_latest_time
  let check1 = input_ship_datum.last_move_latest_time <= tx_earliest_time
  trace @"Check 1 - must_respect_latest_time (old <= tx_start):"
  trace check1
  trace @"  old last_move_latest_time:"
  trace input_ship_datum.last_move_latest_time
  trace @"  tx_earliest_time:"
  trace tx_earliest_time
  
  // Check 2: Speed calculation
  let distance = utils.distance(delta_x, delta_y)
  trace @"Check 2 - distance:"
  trace distance
  
  let time_window = tx_latest_time - tx_earliest_time
  trace @"  time_window (tx_latest - tx_earliest):"
  trace time_window
  
  // Max speed check - let's assume max_speed is 10 distance per 1000 ms
  let max_speed_distance = 10
  let max_speed_time = 1000
  expect Some(max_speed_rational) = rational.new(max_speed_distance, max_speed_time)
  expect Some(actual_speed) = rational.new(distance, time_window)
  
  let speed_ok = rational.compare_with(actual_speed, <=, max_speed_rational)
  trace @"  speed check:"
  trace speed_ok
  
  // Check 3: Output datum validation
  let expected_pos_x = input_ship_datum.pos_x + delta_x
  let expected_pos_y = input_ship_datum.pos_y + delta_y
  
  trace @"Check 3 - position update:"
  trace @"  expected pos_x:"
  trace expected_pos_x
  trace @"  actual pos_x:"
  trace output_ship_datum.pos_x
  trace @"  expected pos_y:"
  trace expected_pos_y
  trace @"  actual pos_y:"
  trace output_ship_datum.pos_y
  
  // Check 4: Timestamp in output datum
  let timestamp_ok = output_ship_datum.last_move_latest_time >= tx_latest_time
  trace @"Check 4 - output timestamp >= tx_latest:"
  trace timestamp_ok
  trace @"  output last_move_latest_time:"
  trace output_ship_datum.last_move_latest_time
  trace @"  tx_latest_time:"
  trace tx_latest_time
  
  // Check 5: Fuel calculation
  let fuel_per_step = 1
  let required_fuel = utils.required_fuel(distance, fuel_per_step)
  trace @"Check 5 - fuel:"
  trace @"  required_fuel:"
  trace required_fuel
  
  // All checks must pass
  check1 && speed_ok && (expected_pos_x == output_ship_datum.pos_x) && 
  (expected_pos_y == output_ship_datum.pos_y) && timestamp_ok
}