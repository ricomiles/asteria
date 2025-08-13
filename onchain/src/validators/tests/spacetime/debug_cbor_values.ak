use aiken/interval.{Finite, Interval, IntervalBound}
use asteria/types.{ShipDatum}

test debug_cbor_exact_values() {
  // From the CBOR: ship datum last_move_latest_time = 1830176821000
  let ship_datum_timestamp = 1830176821000
  
  // From the CBOR: validity bounds
  // Lower bound: slot 163520820 -> should be 1830176820000 + offset
  // Upper bound: slot 163521129 -> should be 1830177129000 + offset
  let tx_earliest_time = 1830176820000 // field 8 converted
  let tx_latest_time = 1830177129000   // field 3 converted
  
  trace @"=== CBOR Values Test ==="
  trace @"Ship datum timestamp:"
  trace ship_datum_timestamp
  trace @"Transaction upper bound:"
  trace tx_latest_time
  trace @"Ship timestamp >= tx upper bound:"
  trace (ship_datum_timestamp >= tx_latest_time)
  
  // This is the failing check in the validator (line 128)
  let check_passes = ship_datum_timestamp >= tx_latest_time
  
  trace @"Check should pass but doesn't:"
  trace check_passes
  
  // The difference
  trace @"Difference (negative means ship timestamp is too small):"
  trace (ship_datum_timestamp - tx_latest_time)
  
  check_passes
}