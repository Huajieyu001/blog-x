import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = (name) => readFile(new URL(name, import.meta.url), "utf8");
test("monitor templates remain dormant and hardened", async () => { const [service,timer]=await Promise.all([read("./blog-x-monitor@.service"),read("./blog-x-monitor@.timer")]); assert.match(service,/User=blog-x/); assert.match(service,/ops-monitor\.mjs --policy=\/etc\/blog-x\/monitor-%i\.json/); assert.match(service,/ProtectSystem=strict/); assert.match(service,/ReadWritePaths=\/var\/lib\/blog-x\/monitor/); assert.doesNotMatch(service,/systemctl|curl|bash|47\.99/); assert.match(timer,/OnCalendar=\*:0\/5:00/); assert.match(timer,/Persistent=true/); });
