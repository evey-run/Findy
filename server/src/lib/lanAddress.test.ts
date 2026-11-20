import assert from 'node:assert/strict';
import test from 'node:test';
import type os from 'node:os';
import { lanAddresses } from './lanAddress';

type Interfaces = NodeJS.Dict<os.NetworkInterfaceInfo[]>;

function ipv4(address: string, internal = false): os.NetworkInterfaceInfo {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
  };
}

test('les interfaces virtuelles et la boucle locale sont écartées', () => {
  const interfaces: Interfaces = {
    lo0: [ipv4('127.0.0.1', true)],
    utun4: [ipv4('10.8.0.2')],
    'bridge100': [ipv4('192.168.64.1')],
    en0: [ipv4('192.168.1.20')],
  };

  assert.deepEqual(lanAddresses(interfaces), [{ iface: 'en0', address: '192.168.1.20' }]);
});

test('le Wi-Fi passe avant les autres interfaces physiques', () => {
  const interfaces: Interfaces = {
    en5: [ipv4('192.168.1.44')],
    en0: [ipv4('192.168.1.20')],
  };

  assert.deepEqual(lanAddresses(interfaces).map((entry) => entry.address), [
    '192.168.1.20',
    '192.168.1.44',
  ]);
});

test('les adresses IPv6 sont ignorées', () => {
  const interfaces: Interfaces = {
    en0: [
      { ...ipv4('192.168.1.20'), family: 'IPv6', address: 'fe80::1', cidr: 'fe80::1/64' },
      ipv4('192.168.1.20'),
    ],
  };

  assert.deepEqual(lanAddresses(interfaces), [{ iface: 'en0', address: '192.168.1.20' }]);
});

test('une machine sans interface physique ne renvoie rien', () => {
  assert.deepEqual(lanAddresses({ lo0: [ipv4('127.0.0.1', true)] }), []);
});
