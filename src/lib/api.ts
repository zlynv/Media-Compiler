import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Build,
  BuildArtifact,
  BuildEvent,
  MediaContract,
  QAResult,
  ReleaseManifest,
  RepairAction,
  ReviewItem,
  SourceAsset,
} from "@/lib/types";
import type { RegressionReport } from "@/lib/regression";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const get = <T,>(url: string): Promise<T> => fetch(url).then(json<T>);
const post = <T,>(url: string, body?: unknown): Promise<T> =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(json<T>);

export interface BuildDetail {
  build: Build;
  contract: MediaContract | null;
  asset: SourceAsset | null;
  artifacts: BuildArtifact[];
  qa: QAResult[];
  repairs: RepairAction[];
  events: BuildEvent[];
  release: ReleaseManifest | null;
  regression: RegressionReport | null;
}

// Contracts
export const useContracts = () =>
  useQuery({ queryKey: ["contracts"], queryFn: () => get<{ contracts: MediaContract[] }>("/api/contracts") });

export const useContract = (id: string) =>
  useQuery({
    queryKey: ["contract", id],
    queryFn: () => get<{ contract: MediaContract; builds: Build[] }>(`/api/contracts/${id}`),
    enabled: Boolean(id),
  });

export const useCreateContract = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => post<{ contract: MediaContract }>("/api/contracts", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts"] }),
  });
};

export const useUpdateContract = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => fetch(`/api/contracts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(json<{ contract: MediaContract }>),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["contract", id] });
    },
  });
};

// Assets
export const useAssets = () =>
  useQuery({ queryKey: ["assets"], queryFn: () => get<{ assets: SourceAsset[] }>("/api/assets") });

export const useCreateAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => post<{ asset: SourceAsset }>("/api/assets", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });
};

export const useUpdateAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { id: string; altText: string | null }) =>
      fetch("/api/assets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(json<{ asset: SourceAsset }>),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assets"] }),
  });
};

// Builds
export const useBuilds = (status?: string) =>
  useQuery({
    queryKey: ["builds", status ?? "all"],
    queryFn: () =>
      get<{ builds: Build[]; repairsByBuild: Record<string, number> }>(
        status ? `/api/builds?status=${status}` : "/api/builds",
      ),
  });

export const useBuild = (id: string, refetchInterval?: number | false) =>
  useQuery({
    queryKey: ["build", id],
    queryFn: () => get<BuildDetail>(`/api/builds/${id}`),
    enabled: Boolean(id),
    refetchInterval: refetchInterval ?? false,
  });

export const useCompile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { sourceAssetId: string; contractId: string }) =>
      post<{ build: Build }>("/api/builds", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["builds"] }),
  });
};

export const useRepairBuild = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ build: Build }>(`/api/builds/${id}/repair`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["build", id] });
      qc.invalidateQueries({ queryKey: ["builds"] });
    },
  });
};

export const useRetestBuild = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ build: Build }>(`/api/builds/${id}/retest`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["build", id] });
      qc.invalidateQueries({ queryKey: ["builds"] });
    },
  });
};

export const useReleaseBuild = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<{ release: ReleaseManifest }>(`/api/builds/${id}/release`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["build", id] });
      qc.invalidateQueries({ queryKey: ["builds"] });
      qc.invalidateQueries({ queryKey: ["releases"] });
    },
  });
};

export const useExplanation = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: ["explain", id],
    queryFn: () => get<{ explanation: string }>(`/api/builds/${id}/release`),
    enabled: enabled && Boolean(id),
  });

// Reviews
export const useReviews = () =>
  useQuery({ queryKey: ["reviews"], queryFn: () => get<{ reviews: ReviewItem[] }>("/api/reviews") });

export const useDecideReview = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { reviewId: string; decision: "APPROVED" | "REJECTED" }) =>
      post<{ review: ReviewItem }>("/api/reviews", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["reviews"] }),
  });
};

// Releases
export const useReleases = () =>
  useQuery({ queryKey: ["releases"], queryFn: () => get<{ releases: ReleaseManifest[] }>("/api/releases") });

export const useRollback = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (releaseId: string) => post<{ release: ReleaseManifest }>("/api/releases/rollback", { releaseId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["releases"] }),
  });
};
