import { ShellWithPersistentHeader, hint13Case } from '../../../test/navigation-scenario';

hint13Case({
    name: 'an OnPush header beside the outlet is not reported for the page navigated to',
    shell: ShellWithPersistentHeader,
    wired: false,
    reportedAtNewUrl: false,
});
