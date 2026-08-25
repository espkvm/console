/* Installs ts-resolve.mjs for the test run; see the note in that file. */
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
