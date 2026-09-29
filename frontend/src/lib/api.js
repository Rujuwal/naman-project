import axios from "axios";
import { formatCustomerOrderNo, formatPlanNo } from "@/lib/documentNumbers";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });
export default client;

// Older records include the year in their stored references. Convert them at
// the API boundary so every screen and print slip uses the same short format.
const formatDocumentNumbers = (value) => {
  if (Array.isArray(value)) return value.map(formatDocumentNumbers);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (key === "plan_no") return [key, formatPlanNo(item)];
    if (key === "co_no") return [key, formatCustomerOrderNo(item)];
    if (key === "co_nos" && Array.isArray(item)) return [key, item.map(formatCustomerOrderNo)];
    return [key, formatDocumentNumbers(item)];
  }));
};

export const api = {
  get: (u, cfg) => client.get(u, cfg).then((r) => formatDocumentNumbers(r.data)),
  post: (u, d) => client.post(u, d).then((r) => formatDocumentNumbers(r.data)),
  put: (u, d) => client.put(u, d).then((r) => formatDocumentNumbers(r.data)),
  del: (u) => client.delete(u).then((r) => formatDocumentNumbers(r.data)),
};
