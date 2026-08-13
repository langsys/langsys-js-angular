// Angular's JIT compiler — lets TestBed compile the decorated classes at runtime.
import '@angular/compiler';
// Zone is still required by Angular's core runtime, but NOT `zone.js/testing`:
// that module patches Jasmine/Jest globals and installs hooks expecting a
// ProxyZone, which Vitest does not provide. We avoid `fakeAsync`/`tick` and use
// plain async/await instead, so we don't need it.
import 'zone.js';

import { getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting(), {
    teardown: { destroyAfterEach: true },
});
