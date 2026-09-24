import { ShellWithPersistentBlock, hint13Case } from '../../../test/navigation-scenario';

hint13Case({
    name: 'an lsTranslate block in the layout is reported for the page navigated to',
    shell: ShellWithPersistentBlock,
    wired: true,
    reportedAtNewUrl: true,
});
