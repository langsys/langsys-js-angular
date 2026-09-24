import { ShellWithPersistentHeader, hint13Case } from '../../../test/navigation-scenario';

hint13Case({
    name: 'an OnPush header beside the outlet is reported for the page navigated to',
    shell: ShellWithPersistentHeader,
    wired: true,
    reportedAtNewUrl: true,
});
