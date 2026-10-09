// useNodeMonitor — the live poller behind the dashboard, a web replica of the
// non-visual NodeStatusMonitor in BlockchainView.qml. It polls the node's read
// endpoints, derives a NodeStatusModel + the dashboard tile data, and tracks the
// connected / stale / stalled / genesis signals the hero reads.
//
// The view is also drivable directly with a `model` override (see NodeDashboardView),
// which is how the exotic lifecycle states are exercised in tests; this hook covers
// the live path — online, not-started, and the stale overlay.

import { useEffect, useRef, useState } from "react";

import {
  getBlendInfo,
  getCryptarchiaInfo,
  getLeaderAgedNotes,
  getLeaderClaimVouchers,
  getNetworkInfo,
  getPowRewardsClaimable,
  getPowStatus,
  getTimeInfo,
} from "../api/endpoints";
import { BackendStatus, BlendRole, defaultModel, type NodeStatusModel } from "./nodeStatus";

/** The full data the dashboard renders: status model + per-tile figures. */
export interface DashboardModel extends NodeStatusModel {
  // Stake tile.
  stakeTotal: string;
  stakeAddresses: string[];
  // Earned tile (backend-tallied in the native app; not reported over HTTP → "").
  earnedTotal: string;
  earnedClaimCount: number;
  claimsCountingSince: string;
  // Epoch tile.
  epoch: string;
  // Vouchers / Ready-to-claim tile.
  voucherTotalClaimable: string;
  // Peers / Peer ID tiles.
  peerId: string;
  peerCount: number;
  connectionCount: number;
  // Mining Rewards tile.
  powRewardsLepta: string;
  powRewardsClaimed: number;
  powClaimsSubmitted: number;
  powClaimsPending: number;
  claimableTickets: number;
  powActive: boolean;
  miningError: string;
  // Resource tiles (sampled by the native backend; not over HTTP → not reported).
  nodeCpuPercent: number;
  nodeMemoryMb: number;
  cpuCount: number;
  nodeDiskUsedMb: number;
  nodeDiskFreeMb: number;
  // cryptarchia/info scalars (raw strings; "" = absent).
  slot: string;
  heightValue: string;
  lib: string;
  libSlot: string;
  tip: string;
  // Keys-backup banner.
  keystorePresent: boolean;
  keysBackedUp: boolean;
}

export function defaultDashboardModel(): DashboardModel {
  return {
    ...defaultModel(),
    stakeTotal: "",
    stakeAddresses: [],
    earnedTotal: "",
    earnedClaimCount: 0,
    claimsCountingSince: "",
    epoch: "—",
    voucherTotalClaimable: "",
    peerId: "",
    peerCount: -1,
    connectionCount: -1,
    powRewardsLepta: "",
    powRewardsClaimed: 0,
    powClaimsSubmitted: 0,
    powClaimsPending: 0,
    claimableTickets: 0,
    powActive: false,
    miningError: "",
    nodeCpuPercent: -1,
    nodeMemoryMb: -1,
    cpuCount: 1,
    nodeDiskUsedMb: -1,
    nodeDiskFreeMb: -1,
    slot: "",
    heightValue: "",
    lib: "",
    libSlot: "",
    tip: "",
    keystorePresent: false,
    keysBackedUp: false,
  };
}

export interface MonitorOptions {
  /** Poll cadence in ms (default 2000). */
  intervalMs?: number;
  /** Disable the poller (keeps the initial model). */
  enabled?: boolean;
}

const STALL_MS = 10 * 60 * 1000;

/** Live node monitor: returns the current dashboard model, repolled on an interval. */
export function useNodeMonitor(options: MonitorOptions = {}): DashboardModel {
  const { intervalMs = 2000, enabled = true } = options;
  const [model, setModel] = useState<DashboardModel>(defaultDashboardModel);

  // Mutable cross-poll state (not render state).
  const lastSuccessRef = useRef<number>(0);
  const failuresRef = useRef<number>(0);
  const everConnectedRef = useRef<boolean>(false);
  const hasBeenOnlineRef = useRef<boolean>(false);
  const nonOnlineStreakRef = useRef<number>(0);
  const lastHeightRef = useRef<string>("");
  const lastHeightChangeRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Reads can take up to READ_TIMEOUT_MS (some endpoints hang while Bootstrapping);
    // skip a tick rather than stack polls on the node.
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        await pollOnce();
      } finally {
        inFlight = false;
      }
    }

    async function pollOnce() {
      const [info, time, net, blend, pow, claimable, aged, vouchers] = await Promise.allSettled([
        getCryptarchiaInfo(),
        getTimeInfo(),
        getNetworkInfo(),
        getBlendInfo(),
        getPowStatus(),
        getPowRewardsClaimable(),
        getLeaderAgedNotes(),
        getLeaderClaimVouchers(),
      ]);
      if (cancelled) return;

      const now = Date.now();
      const connected = info.status === "fulfilled";

      setModel((prev) => {
        const next: DashboardModel = { ...prev };

        if (connected) {
          everConnectedRef.current = true;
          failuresRef.current = 0;
          lastSuccessRef.current = now;
          if (startedAtRef.current === 0) startedAtRef.current = now;

          const ci = info.value.cryptarchia_info;
          const online = ci.state === "Online" && info.value.phase === "Following";
          if (online) {
            nonOnlineStreakRef.current = 0;
            hasBeenOnlineRef.current = true;
          } else {
            nonOnlineStreakRef.current += 1;
          }
          // Debounce the fall from Online: a single blip must not repaint.
          const synced = online || (prev.synced && nonOnlineStreakRef.current < 2);

          // Stall detection: no height progress for 10 minutes while not synced.
          const heightStr = String(ci.height);
          if (heightStr !== lastHeightRef.current) {
            lastHeightRef.current = heightStr;
            lastHeightChangeRef.current = now;
          }
          const stalled =
            !synced && lastHeightChangeRef.current > 0 && now - lastHeightChangeRef.current > STALL_MS;

          next.status = BackendStatus.Running;
          next.connected = true;
          next.everConnected = true;
          next.moduleReachable = true;
          next.statusStale = false;
          next.statusSilentSeconds = 0;
          next.statusNextPollSeconds = 0;
          next.synced = synced;
          next.hasBeenOnline = hasBeenOnlineRef.current;
          next.syncStalled = stalled;
          next.uptimeSeconds = Math.max(0, Math.floor((now - startedAtRef.current) / 1000));

          next.slot = String(ci.slot);
          next.heightValue = heightStr;
          next.lib = ci.lib ?? "";
          next.libSlot = ci.lib_slot !== undefined ? String(ci.lib_slot) : "";
          next.tip = ci.tip ?? "";
        } else {
          failuresRef.current += 1;
          next.connected = false;
          next.everConnected = everConnectedRef.current;
          if (everConnectedRef.current) {
            // Keep the last headline; grey it; explain the gap.
            next.statusStale = true;
            next.statusSilentSeconds =
              lastSuccessRef.current > 0 ? Math.floor((now - lastSuccessRef.current) / 1000) : 0;
            next.statusNextPollSeconds = Math.round(
              Math.min(30000, intervalMs * Math.pow(2, Math.min(5, failuresRef.current))) / 1000,
            );
          } else {
            next.status = BackendStatus.NotStarted;
          }
        }

        // Time info → epoch + genesis.
        if (time.status === "fulfilled") {
          next.epoch = String(time.value.current_epoch);
          next.genesisUnixMs = time.value.genesis_time_unix_ms;
          next.genesisPending =
            connected && !next.synced && time.value.genesis_time_unix_ms > now;
        }

        // Network info → peers + peer id.
        if (net.status === "fulfilled") {
          next.peerId = net.value.peer_id ?? "";
          next.peerCount = net.value.connected_peers?.length ?? 0;
          next.connectionCount = net.value.connected_peers?.length ?? 0;
        } else if (!connected) {
          next.peerCount = -1;
          next.connectionCount = -1;
        }

        // Blend role.
        if (blend.status === "fulfilled" && connected && next.synced) {
          next.blendRole = blend.value.core_info != null ? BlendRole.Core : BlendRole.Edge;
        } else if (!connected || !next.synced) {
          next.blendRole = BlendRole.Unknown;
        }

        // PoW status → mining active.
        if (pow.status === "fulfilled") {
          next.miningActive = pow.value.is_mining;
        }

        // Claimable tickets.
        if (claimable.status === "fulfilled") {
          next.claimableTickets = claimable.value.claimable_tickets;
        }

        // Aged notes → stake.
        if (aged.status === "fulfilled") {
          const a = aged.value;
          next.stakeTotal = a.total_value !== undefined ? String(a.total_value) : "";
          next.stakeNoteCount = a.count ?? 0;
          next.walletFunded = (a.count ?? 0) > 0 || (a.total_value ?? 0) > 0;
          const addrs = new Set<string>();
          for (const n of a.notes ?? []) if (n.public_key) addrs.add(n.public_key);
          next.stakeAddresses = [...addrs];
        }

        // Vouchers → ready-to-claim.
        if (vouchers.status === "fulfilled") {
          next.voucherCount = vouchers.value.vouchers?.length ?? 0;
          next.voucherTotalClaimable =
            vouchers.value.total_claimable !== undefined
              ? String(vouchers.value.total_claimable)
              : "";
        }

        return next;
      });
    }

    void poll();
    const id = setInterval(() => void poll(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [enabled, intervalMs]);

  return model;
}
