import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Card } from "@/components/Common";

export default function Fabricators() {
  const [fabs, setFabs] = useState([]);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    api.get("/fabricators").then(setFabs);
  }, []);

  return (
    <div data-testid="fabricators-page">
      <PageHeader title="Fabricators" subtitle="Outsourced stitching partners" />
      <Card>
        <table className="data-table w-full">
          <thead><tr><th>Name</th><th>Phone</th><th>Address</th><th>Status</th></tr></thead>
          <tbody>
            {fabs.map((f) => <tr key={f.id}><td>{f.name}</td><td>{f.phone || "-"}</td><td>{f.address || "-"}</td><td>{f.active ? "Active" : "Inactive"}</td></tr>)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
