/**
 * Bluetooth stack selector.
 *
 * Change BT_STACK here to switch between Classic SPP (CardioSleeve hardware)
 * and BLE GATT (iPhone / LightBlue testing), then rebuild the app.
 *
 *   'classic'  →  Bluetooth Classic SPP  (production default, CardioSleeve)
 *   'ble'      →  BLE GATT / Nordic UART  (iPhone testing via LightBlue)
 */
export const BT_STACK: 'classic' | 'ble' = 'ble';
