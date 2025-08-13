use aiken/interval.{Finite, Interval, IntervalBound}
use aiken/math/rational
use aiken/option
use aiken/collection/list
use aiken/collection/dict
use asteria/types.{MoveShip, ShipDatum}
use asteria/utils
use cardano/address.{Address, Script}
use cardano/assets.{from_asset, quantity_of, tokens, without_lovelace, add}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction, TransactionId, Input}

test debug_validator_directly() {
  // Exact values from your CBOR
  let delta_x = 0
  let delta_y = -1
  
  // Mock the shipyard policy from the address
  let shipyard_policy = #"0291ae7aebaf064b785542093c2b13169effb34462301e68d4b44f43"
  let pellet_validator_address = #"3babcffc6102ec25ced40e1a24fba20371925c46f0299b2b9456360e"
  
  // The input ship datum (reconstructed from context)
  let input_ship_datum = ShipDatum {
    pos_x: 25,
    pos_y: 25,  // Since output is (25, 24) after moving (0, -1)
    ship_token_name: #"534849503136",  // SHIP16
    pilot_token_name: #"50494c4f543136",  // PILOT16
    last_move_latest_time: 1830176820000,  // Some previous time
  }
  
  // The output ship datum from CBOR
  let output_ship_datum = ShipDatum {
    pos_x: 25,
    pos_y: 24,
    ship_token_name: #"534849503136",
    pilot_token_name: #"50494c4f543136",
    last_move_latest_time: 1830177129000,
  }
  
  // Transaction validity range
  // Lower bound: slot 163520829 
  // Upper bound: slot 163521129
  // These are the POSIX times as the validator will see them
  let tx_earliest_time = 1830176829000  
  let tx_latest_time = 1830177129000
  
  let validity_range = Interval {
    lower_bound: IntervalBound {
      bound_type: Finite(tx_earliest_time),
      is_inclusive: True,
    },
    upper_bound: IntervalBound {
      bound_type: Finite(tx_latest_time),
      is_inclusive: False,
    },
  }
  
  // Extract times from validity range like the validator does
  expect Finite(extracted_earliest) = validity_range.lower_bound.bound_type
  expect Finite(extracted_latest) = validity_range.upper_bound.bound_type
  
  trace @"=== Validity Range ==="
  trace @"  tx_earliest_time:"
  trace extracted_earliest
  trace @"  tx_latest_time:"
  trace extracted_latest
  
  // Check 1: must_respect_latest_time (line 102)
  let must_respect_latest_time = input_ship_datum.last_move_latest_time <= extracted_earliest
  trace @"=== Check 1: must_respect_latest_time ==="
  trace @"  input last_move_latest_time:"
  trace input_ship_datum.last_move_latest_time
  trace @"  must be <= tx_earliest_time:"
  trace extracted_earliest
  trace @"  Result:"
  trace must_respect_latest_time
  
  // Check 2: Speed calculation (lines 96-100)
  let distance = utils.distance(delta_x, delta_y)
  trace @"=== Check 2: Speed ==="
  trace @"  distance:"
  trace distance
  
  let time_window = extracted_latest - extracted_earliest
  trace @"  time_window:"
  trace time_window
  
  // Assuming max_speed is distance=10, time=1000
  let max_speed_distance = 10
  let max_speed_time = 1000
  expect Some(max_speed_rational) = rational.new(max_speed_distance, max_speed_time)
  expect Some(actual_speed) = rational.new(distance, time_window)
  
  let must_respect_max_speed = rational.compare_with(actual_speed, <=, max_speed_rational)
  trace @"  must_respect_max_speed:"
  trace must_respect_max_speed
  
  // Check 3: Output datum position (lines 119-126)
  let expected_pos_x = input_ship_datum.pos_x + delta_x
  let expected_pos_y = input_ship_datum.pos_y + delta_y
  
  trace @"=== Check 3: Position Update ==="
  trace @"  expected_pos_x:"
  trace expected_pos_x
  trace @"  actual output pos_x:"
  trace output_ship_datum.pos_x
  trace @"  Position X matches:"
  trace (expected_pos_x == output_ship_datum.pos_x)
  
  trace @"  expected_pos_y:"
  trace expected_pos_y
  trace @"  actual output pos_y:"
  trace output_ship_datum.pos_y
  trace @"  Position Y matches:"
  trace (expected_pos_y == output_ship_datum.pos_y)
  
  // Check 4: Output timestamp (line 128)
  let must_have_correct_datum_timestamp = output_ship_datum.last_move_latest_time >= extracted_latest
  trace @"=== Check 4: Output Timestamp ==="
  trace @"  output last_move_latest_time:"
  trace output_ship_datum.last_move_latest_time
  trace @"  must be >= tx_latest_time:"
  trace extracted_latest
  trace @"  Result:"
  trace must_have_correct_datum_timestamp
  
  // Check 5: Check if ship/pilot names match
  let names_match = (input_ship_datum.ship_token_name == output_ship_datum.ship_token_name) && 
                    (input_ship_datum.pilot_token_name == output_ship_datum.pilot_token_name)
  trace @"=== Check 5: Token Names ==="
  trace @"  ship names match:"
  trace (input_ship_datum.ship_token_name == output_ship_datum.ship_token_name)
  trace @"  pilot names match:"
  trace (input_ship_datum.pilot_token_name == output_ship_datum.pilot_token_name)
  
  // Check 6: Fuel calculation (lines 93-94, 141-142)
  let fuel_per_step = 1
  let required_fuel = utils.required_fuel(distance, fuel_per_step)
  trace @"=== Check 6: Fuel ==="
  trace @"  required_fuel:"
  trace required_fuel
  trace @"  (expecting mint of -1 FUEL token)"
  
  // Overall result
  let all_checks = must_respect_latest_time && must_respect_max_speed && 
                   (expected_pos_x == output_ship_datum.pos_x) && 
                   (expected_pos_y == output_ship_datum.pos_y) && 
                   must_have_correct_datum_timestamp && names_match
  
  trace @"=== FINAL RESULT ==="
  trace @"  All checks passed:"
  trace all_checks
  
  all_checks
}