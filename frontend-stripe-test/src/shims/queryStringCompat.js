import queryString from "query-string";

export const parse = (...args) => queryString.parse(...args);
export const stringify = (...args) => queryString.stringify(...args);

export default queryString;
