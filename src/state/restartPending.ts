/*
 * Settings saved this session that apply only after a restart. Kept outside
 * the settings panel so closing and opening it again does not forget them;
 * the restart reloads the page, which clears the list.
 */
import { ref } from "vue";

export const restartPending = ref<string[]>([]);
