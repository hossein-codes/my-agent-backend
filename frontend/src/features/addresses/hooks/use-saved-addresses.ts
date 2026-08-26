"use client";

import * as React from "react";
import type { AddressFormValues } from "@/features/checkout/schemas/checkout-schema";

/**
 * Local address book (device-scoped). The backend currently takes the address
 * inline per order (no CRUD endpoint yet), so the storefront keeps a local
 * draft to prefill checkout — swap to a real API transparently when it lands.
 *
 * Implemented as a tiny external store read via useSyncExternalStore so
 * hydration stays consistent (server sees [], client sees its list) without
 * effect-time setState.
 */
const KEY = "lumina.addresses";

export interface SavedAddress extends AddressFormValues {
  id: string;
  label: string;
}

let cache: SavedAddress[] | null = null;
const listeners = new Set<() => void>();

function read(): SavedAddress[] {
  if (cache !== null) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as SavedAddress[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: SavedAddress[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full/blocked — in-memory list still works this session
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function getSnapshot(): SavedAddress[] {
  return read();
}

function getServerSnapshot(): SavedAddress[] {
  return EMPTY;
}

const EMPTY: SavedAddress[] = [];

export function useSavedAddresses() {
  const addresses = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const save = React.useCallback((addr: SavedAddress) => {
    const cur = read();
    write(
      cur.some((a) => a.id === addr.id)
        ? cur.map((a) => (a.id === addr.id ? addr : a))
        : [...cur, addr],
    );
  }, []);

  const remove = React.useCallback((id: string) => {
    write(read().filter((a) => a.id !== id));
  }, []);

  return { addresses, save, remove };
}
