import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

/**
 * Starts the vendored contract double (`contract-fixture/server.mjs`, spec CONF-2) in its own
 * process. `state()` returns only what the double accepted — there is no accessor for what it
 * received, so a test can assert on acceptance and nothing else (CONF-1).
 */
export interface AcceptedState {
    projects: Record<
        string,
        {
            phrases: Array<{ category: string | null; phrase: string }>;
            blocks: Array<{ category: string | null; custom_id: string; phrases: Array<{ phrase: string }> }>;
        }
    >;
    hints: Array<{ project_id: string; url: string }>;
}

export interface ContractFixture {
    baseUrl: string;
    seed(doc: unknown): Promise<void>;
    state(): Promise<AcceptedState>;
    stop(): Promise<void>;
}

export async function startContractFixture(): Promise<ContractFixture> {
    const child: ChildProcess = spawn(process.execPath, [join(process.cwd(), 'contract-fixture', 'server.mjs')], {
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    const ready = await new Promise<{ base_url: string; fixture_url: string }>((resolve, reject) => {
        let buffered = '';
        const timer = setTimeout(() => reject(new Error('contract fixture not ready within 10s')), 10_000);
        child.stdout!.on('data', (chunk: Buffer) => {
            buffered += chunk.toString('utf8');
            const end = buffered.indexOf('\n');
            if (end < 0) return;
            clearTimeout(timer);
            resolve(JSON.parse(buffered.slice(0, end)));
        });
        child.once('exit', (code) => reject(new Error(`contract fixture exited early (${code})`)));
    });
    return {
        baseUrl: ready.base_url,
        async seed(doc) {
            const res = await fetch(`${ready.fixture_url}/seed`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(doc),
            });
            if (!res.ok) throw new Error(`fixture seed answered ${res.status}: ${await res.text()}`);
        },
        state: async () => (await (await fetch(`${ready.fixture_url}/state`)).json()) as AcceptedState,
        stop: () =>
            new Promise<void>((resolve) => {
                if (child.exitCode !== null) return resolve();
                child.once('exit', () => resolve());
                child.kill('SIGTERM');
            }),
    };
}

export async function until(check: () => boolean | Promise<boolean>, timeoutMs = 8000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        if (await check()) return;
        if (Date.now() > deadline) throw new Error('condition not met in time');
        await new Promise((r) => setTimeout(r, 50));
    }
}
