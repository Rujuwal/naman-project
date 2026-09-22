import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API });
export default client;

export const api = {
  get: (u, cfg) => client.get(u, cfg).then((r) => r.data),
  post: (u, d) => client.post(u, d).then((r) => r.data),
  put: (u, d) => client.put(u, d).then((r) => r.data),
  del: (u) => client.delete(u).then((r) => r.data),
};
