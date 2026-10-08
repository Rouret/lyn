import { getTableColumns } from "@rouret/lyn/db";
import { posts } from "./schema";

const { authorEmail: _authorEmail, ...publicPostColumns } = getTableColumns(posts);

export const PUBLIC_POST_COLUMNS = publicPostColumns;

export const PRIVATE_POST_COLUMNS = { authorEmail: false } as const;
