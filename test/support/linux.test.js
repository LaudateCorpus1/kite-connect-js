'use strict';

const proc = require('child_process');
const fs = require('fs');
const https = require('https');
const sinon = require('sinon');
const expect = require('expect.js');

const LinuxAdapter = require('../../lib/support/linux');

const {waitsForPromise} = require('../helpers/async');
const {withFakeServer} = require('../helpers/http');
const {fakeCommands} = require('../helpers/child_process');
const {
  withKiteInstalled, withKiteRunning, withKiteNotRunning,
} = require('../helpers/system');
const { kiteDownloadRoutes } = require('../helpers/kite');

const PLATFORM = 'linux';

describe('LinuxAdapter', () => {
  
  describe('.isAdmin()', () => {
    describe('when the user is an admin', () => {
      beforeEach(() => {
        fakeCommands({
          exec: {
            whoami: (ps) => {
              ps.stdout('username');
              return 0;
            },
            'getent group root adm admin sudo': (ps) => {
              ps.stdout('root:x:0:\nadm:x:4:syslog,username\nsudo:x:27:username');
              return 0;
            },
          },
        });
      });

      it('returns true', () => {
        expect(LinuxAdapter.isAdmin()).to.be.ok();
      });
    });

    describe('when the user is not an admin', () => {
      beforeEach(() => {
        fakeCommands({
          exec: {
            whoami: (ps) => {
              ps.stdout('fake');
              return 0;
            },
            'getent group root adm admin sudo': (ps) => {
              ps.stdout('root:x:0:\nadm:x:4:syslog,username\nsudo:x:27:username');
              return 0;
            },
          },
        });
      });

      it('returns false', () => {
        expect(LinuxAdapter.isAdmin()).not.to.be.ok();
      });
    });
  });

  describe('.isOSVersionSupported()', () => {
    describe('when the os version is not supported', () => {
      beforeEach(() => {
        fakeCommands({
          exec: {
            'lsb_release -r': (ps) => {
              ps.stdout('Release:	16.04');
              return 0;
            },
          },
        });
      });

      it('returns false', () => {
        expect(LinuxAdapter.isOSVersionSupported()).not.to.be.ok();
      });
    });

    describe('when the os version is supported', () => {
      beforeEach(() => {
        fakeCommands({
          exec: {
            'lsb_release -r': (ps) => {
              ps.stdout('Release:	18.04');
              return 0;
            },
          },
        });
      });

      it('returns true', () => {
        expect(LinuxAdapter.isOSVersionSupported()).to.be.ok();
      });
    });
  });

  describe('.isKiteInstalled()', () => {
    withKiteInstalled(PLATFORM, () => {
      it('returns a resolved promise', () => {
        return waitsForPromise(() => LinuxAdapter.isKiteInstalled());
      });
    });

    describe('when kite is not installed', () => {
      it('returns a rejected promise', () => {
        return waitsForPromise({
          shouldReject: true,
        }, () => LinuxAdapter.isKiteInstalled());
      });
    });
  });

  describe('.downloadKite()', () => {
    withFakeServer(kiteDownloadRoutes, () => {
      describe('when the download succeeds', () => {
        let unlinkSpy, isKiteInitiallyInstalledSpy;
        beforeEach(() => {
          unlinkSpy = sinon.stub(fs, 'unlinkSync');
          isKiteInitiallyInstalledSpy = sinon.stub(LinuxAdapter, 'isKiteInitiallyInstalled').resolves();

          fakeCommands({
            apt: () => 0,
          });
        });

        afterEach(() => {
          unlinkSpy.restore();
          isKiteInitiallyInstalledSpy.restore();
        });

        describe('with the install option', () => {
          it('returns a promise resolved after the install', () => {
            const options = {
              install: true,
              onInstallStart: sinon.spy(),
              onMount: sinon.spy(),
              onRemove: sinon.spy(),
            };
            const url = 'https://kite.com/download';

            LinuxAdapter.downloadKite(url, options)
            .then(() => {
              expect(https.request.calledWith(url)).to.be.ok();
              expect(proc.spawn.calledWith('apt', 
                ['install', '-f', LinuxAdapter.KITE_DEB_PATH])).to.be.ok();
              
              expect(fs.unlinkSync.calledWith(LinuxAdapter.KITE_DEB_PATH)).to.be.ok();

              expect(options.onInstallStart.called).to.be.ok();
              expect(options.onMount.called).to.be.ok();
              expect(options.onRemove.called).to.be.ok();
            });
          });
        });
      });
    });
  });

  describe('.isKiteInitiallyInstalled()', () => {
    let existsSpy, readlinkSpy;
    describe('when kite is initially installed', () => {
      beforeEach(() => {
        existsSpy = sinon.stub(fs, 'exists').callArgWith(1, true);
        readlinkSpy = sinon.stub(fs, 'readlink').callArgWith(1, null, 'kite-v1');
      });

      afterEach(() => {
        existsSpy.restore();
        readlinkSpy.restore();
      });
      
      it('returns a resolved promise', () => {
        return waitsForPromise(() => LinuxAdapter.isKiteInitiallyInstalled());
      });
    });

    describe('when kite is not initially installed', () => {
      beforeEach(() => {
        existsSpy = sinon.stub(fs, 'exists').callArgWith(1, true);
      });

      afterEach(() => {
        existsSpy.restore();
      });
      
      it('returns a rejected promise', () => {
        return waitsForPromise({
          shouldReject: true,
        }, () => LinuxAdapter.isKiteInitiallyInstalled());
      });
    });
  });

  describe('.installKite()', () => {
    let unlinkSpy, isKiteInitiallyInstalledSpy;
    describe('when the total installation succeeds', () => {
      beforeEach(() => {
        unlinkSpy = sinon.stub(fs, 'unlinkSync');
        isKiteInitiallyInstalledSpy = sinon.stub(LinuxAdapter, 'isKiteInitiallyInstalled').resolves();
        fakeCommands({
          apt: () => 0,
        });
      });

      afterEach(() => {
        unlinkSpy.restore();
        isKiteInitiallyInstalledSpy.restore();
      });

      it('returns a resolved promise', () => {
        const options = {
          onInstallStart: sinon.stub(),
          onMount: sinon.stub(),
          onRemove: sinon.stub(),
        };
        return waitsForPromise(() => LinuxAdapter.installKite(options))
        .then(() => {
          expect(proc.spawn.calledWith('apt', [
            'install', '-f', LinuxAdapter.KITE_DEB_PATH,
          ])).to.be.ok();
          expect(fs.unlinkSync.calledWith(LinuxAdapter.KITE_DEB_PATH)).to.be.ok();

          expect(options.onInstallStart.called).to.be.ok();
          expect(options.onMount.called).to.be.ok();
          expect(options.onRemove.called).to.be.ok();
        });
      });
    });

    describe('when the installation fails', () => {
      beforeEach(() => {
        fakeCommands({
          apt: () => 1,
        });
      });

      it('returns a rejected promise', () => {
        return waitsForPromise({
          shouldReject: true,
        }, () => LinuxAdapter.installKite());
      });
    });

    describe('when removing the deb fails', () => {
      beforeEach(() => {
        unlinkSpy = sinon.stub(fs, 'unlinkSync').throws('unlink failed');
        fakeCommands({
          apt: () => 0,
        });
      });

      afterEach(() => {
        unlinkSpy.restore();
      });

      it('returns a rejected promise', () => {
        return waitsForPromise({
          shouldReject: true,
        }, () => LinuxAdapter.installKite());
      });
    });

    describe('when kited does not get updated properly', () => {
      beforeEach(() => {
        unlinkSpy = sinon.stub(fs, 'unlinkSync');
        isKiteInitiallyInstalledSpy = sinon.stub(LinuxAdapter, 'isKiteInitiallyInstalled').rejects('kited not there');
        fakeCommands({
          apt: () => 0,
        });
      });

      afterEach(() => {
        unlinkSpy.restore();
        isKiteInitiallyInstalledSpy.restore();
      });
      
      it('returns a rejected promise', () => {
        const options = {
          onInstallStart: sinon.stub(),
          onMount: sinon.stub(),
          onRemove: sinon.stub(),
        };
        return waitsForPromise({
          shouldReject: true,
        }, () => LinuxAdapter.installKite(options))
        .then(() => {
          expect(proc.spawn.calledWith('apt', [
            'install', '-f', LinuxAdapter.KITE_DEB_PATH,
          ])).to.be.ok();
          expect(fs.unlinkSync.calledWith(LinuxAdapter.KITE_DEB_PATH)).to.be.ok();

          expect(options.onInstallStart.called).to.be.ok();
          expect(options.onMount.called).to.be.ok();
          expect(options.onRemove.called).to.be.ok();
        });
      });
    });
  });

  describe('.isKiteRunning()', () => {
    describe('when kite is not installed', () => {
      it('returns a rejected promise', () => {
        return waitsForPromise({
          shouldReject: true,
        }, () => LinuxAdapter.installKite());
      });
    });

    withKiteInstalled(PLATFORM, () => {
      describe('but not running', () => {
        beforeEach(() => {
          fakeCommands({
            '/bin/ps': (ps) => {
              ps.stdout('');
              return 0;
            },
          });
        });

        it('returns a rejected promise', () => {
          return waitsForPromise({
            shouldReject: true,
          }, () => LinuxAdapter.isKiteRunning());
        });
      });

      withKiteRunning(PLATFORM, () => {
        it('returns a resolved promise', () => {
          return waitsForPromise(() => LinuxAdapter.isKiteRunning());
        });
      });
    });
  });

  describe('.runKite()', () => {
    describe('when kite is not installed', () => {
      it('returns a rejected promise', () => {
        return waitsForPromise({shouldReject: true}, () => LinuxAdapter.runKite());
      });
    });

    withKiteRunning(PLATFORM, () => {
      it('returns a resolved promise', () => {
        return waitsForPromise(() => LinuxAdapter.runKite());
      });
    });

    withKiteNotRunning(PLATFORM, () => {
      it('returns a resolved promise', () => {
        return waitsForPromise(() => LinuxAdapter.runKite())
          .then(() => {
            expect(proc.spawn.lastCall.args[0])
            .to.eql(LinuxAdapter.KITED_PATH);
          });
      });
    });
  });
});