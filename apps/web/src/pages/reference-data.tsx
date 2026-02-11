import * as React from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Button, Card, CardContent, Input, Skeleton } from "@/components/ui";
import {
  fetchFacilities,
  fetchStorageLocations,
  fetchSuppliers,
  isUnauthorized,
  parseApiError,
} from "@/lib/api-client";
import type { AuthSession, FacilityRecord, StorageLocationRecord, SupplierRecord } from "@/types";

type ActiveTab = "facilities" | "locations" | "suppliers";

type LocationRow = StorageLocationRecord & {
  facilityName: string;
  facilityCode: string;
};

interface Props {
  session: AuthSession;
  onUnauthorized: () => void;
}

function formatFacilityLabel(facilityName: string, facilityCode: string): string {
  return facilityCode ? `${facilityName} (${facilityCode})` : facilityName;
}

export function ReferenceDataRoute({ session, onUnauthorized }: Props) {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>("facilities");
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [facilities, setFacilities] = React.useState<FacilityRecord[]>([]);
  const [locations, setLocations] = React.useState<LocationRow[]>([]);
  const [suppliers, setSuppliers] = React.useState<SupplierRecord[]>([]);

  const [facilityQuery, setFacilityQuery] = React.useState("");
  const [locationQuery, setLocationQuery] = React.useState("");
  const [supplierQuery, setSupplierQuery] = React.useState("");

  const token = session.tokens.accessToken;

  const loadReferenceData = React.useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const [facilitiesResult, suppliersResult] = await Promise.all([
        fetchFacilities(token, { page: 1, pageSize: 200 }),
        fetchSuppliers(token, { page: 1, pageSize: 200 }),
      ]);

      const sortedFacilities = [...facilitiesResult.data].sort((a, b) =>
        formatFacilityLabel(a.name, a.code).localeCompare(formatFacilityLabel(b.name, b.code)),
      );
      const sortedSuppliers = [...suppliersResult.data].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? ""),
      );

      const locationResults = await Promise.allSettled(
        sortedFacilities.map(async (facility) => {
          const result = await fetchStorageLocations(token, facility.id, { page: 1, pageSize: 200 });
          return result.data.map<LocationRow>((location) => ({
            ...location,
            facilityName: facility.name,
            facilityCode: facility.code,
          }));
        }),
      );

      const flattenedLocations = locationResults.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
      flattenedLocations.sort((a, b) =>
        formatFacilityLabel(a.facilityName, a.facilityCode).localeCompare(
          formatFacilityLabel(b.facilityName, b.facilityCode),
        ) || a.code.localeCompare(b.code),
      );

      setFacilities(sortedFacilities);
      setSuppliers(sortedSuppliers);
      setLocations(flattenedLocations);
    } catch (err) {
      if (isUnauthorized(err)) {
        onUnauthorized();
        return;
      }
      setError(parseApiError(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [onUnauthorized, token]);

  React.useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  const filteredFacilities = React.useMemo(() => {
    const q = facilityQuery.trim().toLowerCase();
    if (!q) return facilities;
    return facilities.filter((facility) =>
      [facility.name, facility.code, facility.type]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q)),
    );
  }, [facilities, facilityQuery]);

  const filteredLocations = React.useMemo(() => {
    const q = locationQuery.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((location) =>
      [
        location.name,
        location.code,
        location.zone ?? "",
        location.facilityName,
        location.facilityCode,
      ]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q)),
    );
  }, [locations, locationQuery]);

  const filteredSuppliers = React.useMemo(() => {
    const q = supplierQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((supplier) =>
      [supplier.name, supplier.code ?? ""]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q)),
    );
  }, [suppliers, supplierQuery]);

  const renderFacilitiesTable = () => (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Input
          value={facilityQuery}
          onChange={(event) => setFacilityQuery(event.target.value)}
          placeholder="Search facilities..."
          className="h-9 max-w-sm"
        />
        <p className="text-xs text-muted-foreground">{filteredFacilities.length} rows</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-table-border">
        <table className="w-full divide-y divide-table-border text-sm">
          <thead className="bg-table-header text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Facility</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-table-border">
            {filteredFacilities.map((facility) => (
              <tr key={facility.id}>
                <td className="px-3 py-2">{formatFacilityLabel(facility.name, facility.code)}</td>
                <td className="px-3 py-2 capitalize">{facility.type.replaceAll("_", " ")}</td>
                <td className="px-3 py-2">{facility.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {filteredFacilities.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={3}>
                  No facilities found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  const renderLocationsTable = () => (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Input
          value={locationQuery}
          onChange={(event) => setLocationQuery(event.target.value)}
          placeholder="Search locations..."
          className="h-9 max-w-sm"
        />
        <p className="text-xs text-muted-foreground">{filteredLocations.length} rows</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-table-border">
        <table className="w-full divide-y divide-table-border text-sm">
          <thead className="bg-table-header text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Location</th>
              <th className="px-3 py-2 text-left">Facility</th>
              <th className="px-3 py-2 text-left">Zone</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-table-border">
            {filteredLocations.map((location) => (
              <tr key={location.id}>
                <td className="px-3 py-2">
                  {location.name} ({location.code})
                </td>
                <td className="px-3 py-2">
                  {formatFacilityLabel(location.facilityName, location.facilityCode)}
                </td>
                <td className="px-3 py-2">{location.zone?.trim() || "-"}</td>
                <td className="px-3 py-2">{location.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {filteredLocations.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={4}>
                  No locations found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  const renderSuppliersTable = () => (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Input
          value={supplierQuery}
          onChange={(event) => setSupplierQuery(event.target.value)}
          placeholder="Search suppliers..."
          className="h-9 max-w-sm"
        />
        <p className="text-xs text-muted-foreground">{filteredSuppliers.length} rows</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-table-border">
        <table className="w-full divide-y divide-table-border text-sm">
          <thead className="bg-table-header text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Supplier</th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-table-border">
            {filteredSuppliers.map((supplier) => (
              <tr key={supplier.id}>
                <td className="px-3 py-2">{supplier.name}</td>
                <td className="px-3 py-2">{supplier.code?.trim() || "-"}</td>
                <td className="px-3 py-2">{supplier.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
            {filteredSuppliers.length === 0 && (
              <tr>
                <td className="px-3 py-8 text-center text-sm text-muted-foreground" colSpan={3}>
                  No suppliers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <div className="space-y-3 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reference Data</h1>
          <p className="text-sm text-muted-foreground">
            Facilities, locations, and suppliers used by loops and items.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/parts">Items Table</Link>
          </Button>
          <Button variant="outline" onClick={() => void loadReferenceData()} disabled={isRefreshing}>
            <RefreshCw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border/80">
        <button
          type="button"
          onClick={() => setActiveTab("facilities")}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${
            activeTab === "facilities"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          Facilities
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("locations")}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${
            activeTab === "locations"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          Locations
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("suppliers")}
          className={`border-b-2 px-1 pb-2 text-sm font-medium ${
            activeTab === "suppliers"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground"
          }`}
        >
          Suppliers
        </button>
      </div>

      <Card>
        <CardContent className="p-4">
          {error && (
            <p className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-64" />
              {Array.from({ length: 8 }).map((_, idx) => (
                <Skeleton key={idx} className="h-9 w-full" />
              ))}
            </div>
          ) : activeTab === "facilities" ? (
            renderFacilitiesTable()
          ) : activeTab === "locations" ? (
            renderLocationsTable()
          ) : (
            renderSuppliersTable()
          )}
        </CardContent>
      </Card>
    </div>
  );
}
