import {TestBed} from '@angular/core/testing';

import {SessionService} from './session.service';
import {mustInjected} from '../../base-injectables';
import {serialize} from 'class-transformer';
import {Workspace} from '../models/workspace';
import {AppService} from './app.service';
import {FileService} from './file.service';
import {Session} from '../models/session';
import {WorkspaceService} from './workspace.service';
import {Account} from '../models/account';
import {SessionType} from '../models/session-type';
import {AwsPlainService} from './session/aws-plain.service';
import {LeappNotFoundError} from '../errors/leapp-not-found-error';
import {SessionStatus} from '../models/session-status';

let spyAppService;
let spyFileService;
let spyWorkspaceService;

let mockedSession;
let mockedSessions = [];

const fakePromise = Promise.resolve(undefined);

describe('SessionService', () => {
  spyAppService = jasmine.createSpyObj('AppService', ['getOS']);
  spyAppService.getOS.and.returnValue({ homedir : () => '~/testing' });

  spyFileService = jasmine.createSpyObj('FileService', ['encryptText', 'decryptText', 'writeFileSync', 'readFileSync', 'exists', 'newDir']);
  spyFileService.exists.and.returnValue(true);
  spyFileService.newDir.and.returnValue(true);
  spyFileService.encryptText.and.callFake((text: string) => text);
  spyFileService.decryptText.and.callFake((text: string) => text);
  spyFileService.writeFileSync.and.callFake((_: string, __: string) => {});
  spyFileService.readFileSync.and.callFake((_: string) => serialize(new Workspace()) );

  beforeEach(() => {
    mockedSession = new Session(new Account('fakeaccount', 'eu-west-1'), 'default');
    mockedSession.sessionId = 'fakeid';

    mockedSessions = [mockedSession];
    spyWorkspaceService = {
      sessions: mockedSessions,
      getProfileName: (_: string) => 'default'
    };

    TestBed.configureTestingModule({
      providers: [
        SessionService,
        { provide: WorkspaceService, useValue: spyWorkspaceService },
        { provide: AppService, useValue: spyAppService },
        { provide: FileService, useValue: spyFileService }
      ].concat(mustInjected())

    });
  });

  it('should be created', () => {
    const service: SessionService = TestBed.inject(SessionService);
    expect(service).toBeTruthy();
  });

  describe('get()', () => {
    it('should return a session given the id', () => {
      const service: SessionService = TestBed.inject(SessionService);

      expect(service.get('fakeid')).toBeInstanceOf(Session);
      expect(service.get('fakeid').sessionId).toEqual('fakeid');
      expect(service.get('fakeid').account.accountName).toEqual('fakeaccount');
    });

    it('should return null if session is not found given the id', () => {
      const service: SessionService = TestBed.inject(SessionService);

      expect(service.get('notfoundid')).toBe(null);
    });
  });

  describe('list()', () => {
    it('should return a session list retrieved from workspace', () => {
      const service: SessionService = TestBed.inject(SessionService);

      expect(service.list()).toBeInstanceOf(Array);
      expect(service.list().length).toBeDefined();
      expect(spyWorkspaceService.sessions).toEqual(mockedSessions);
    });
  });

  describe('listChildren()', () => {
    it('should return a session list composed only of truster accounts', () => {
      const service: SessionService = TestBed.inject(SessionService);

      expect(service.listChildren()).toBeInstanceOf(Array);
      expect(service.listChildren().filter(c => c.account.type === SessionType.AWS_TRUSTER)).toEqual([]);

      const mockedSession2 = new Session(new Account('fakeaccount2', 'eu-west-2'), 'fakeprofile2');
      mockedSession2.account.type = SessionType.AWS_TRUSTER;
      mockedSessions.push(mockedSession2);

      expect(service.listChildren()).toBeInstanceOf(Array);
      expect(service.listChildren().filter(c => c.account.type === SessionType.AWS_TRUSTER)).toEqual([mockedSession2]);
    });

    it('should call list() under the hood', () => {
      const service: SessionService = TestBed.inject(SessionService);

      spyOn(service, 'list').and.callThrough();
      service.listChildren();
      expect(service.list).toHaveBeenCalled();
    });
  });

  describe('listActive()', () => {
    it('should return a session list of active sessins only', () => {
      const service: SessionService = TestBed.inject(SessionService);

      expect(service.listActive()).toBeInstanceOf(Array);
      expect(service.listActive().filter(c => c.status === SessionStatus.ACTIVE)).toEqual([]);

      const mockedSession2 = new Session(new Account('fakeaccount2', 'eu-west-2'), 'fakeprofile2');
      mockedSession2.status = SessionStatus.ACTIVE;
      mockedSessions.push(mockedSession2);

      expect(service.listActive()).toBeInstanceOf(Array);
      expect(service.listActive().filter(c => c.status === SessionStatus.ACTIVE)).toEqual([mockedSession2]);
    });

    it('should call list() under the hood', () => {
      const service: SessionService = TestBed.inject(SessionService);

      spyOn(service, 'list').and.callThrough();
      service.listActive();
      expect(service.list).toHaveBeenCalled();
    });
  });

  describe('start()', () => {
    it('should start a session', (done) => {
      const service: SessionService = TestBed.inject(AwsPlainService);

      // <any> is a trick to spy on private methods!
      spyOn<any>(service,'sessionLoading').and.callThrough();
      spyOn<any>(service,'sessionActivate').and.callThrough();
      spyOn(service,'generateCredentials').and.callFake(() => fakePromise);
      spyOn(service,'applyCredentials').and.callFake(() => fakePromise);

      expect(mockedSession.status).toBe(SessionStatus.INACTIVE);

      service.start('fakeid');

      const caller = setTimeout(() => {
        expect((service as any).sessionActivate).toHaveBeenCalled();
        expect(mockedSession.status).toBe(SessionStatus.ACTIVE);

        done();
        clearTimeout(caller);
      }, 200);
    });

    it('should call a list of predefined steps inside', (done) => {
      const service: SessionService = TestBed.inject(AwsPlainService);

      // <any> is a trick to spy on private methods!
      spyOn<any>(service,'sessionLoading').and.callThrough();
      spyOn<any>(service,'sessionActivate').and.callThrough();
      spyOn(service,'generateCredentials').and.callFake(() => fakePromise);
      spyOn(service,'applyCredentials').and.callFake(() => fakePromise);

      service.start('fakeid');

      const caller = setTimeout(() => {
        expect((service as any).sessionLoading).toHaveBeenCalled();
        expect((service as any).generateCredentials).toHaveBeenCalled();
        expect((service as any).applyCredentials).toHaveBeenCalled();
        expect((service as any).sessionActivate).toHaveBeenCalled();

        done();
        clearTimeout(caller);
      }, 200);
    });

    it('should manage an error thrown in a child step', () => {
      const service: SessionService = TestBed.inject(AwsPlainService);

      // <any> is a trick to spy on private methods!
      spyOn<any>(service, 'sessionError').and.callThrough();
      spyOn<any>(service,'sessionLoading').and.callFake(() => {
 throw new LeappNotFoundError(this, 'exploded fake function');
});

      service.start('fakeid');
      expect((service as any).sessionError).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should stop a session', (done) => {
      const service: SessionService = TestBed.inject(AwsPlainService);

      mockedSession.status = SessionStatus.ACTIVE;
      mockedSessions = [mockedSession];

      // <any> is a trick to spy on private methods!
      spyOn(service,'deApplyCredentials').and.callFake(() => fakePromise);
      spyOn<any>(service,'sessionDeactivated').and.callThrough();

      expect(mockedSession.status === SessionStatus.ACTIVE).toBe(true);
      service.stop('fakeid');

      const caller = setTimeout(() => {
        expect((service as any).sessionDeactivated).toHaveBeenCalled();
        expect(mockedSession.status === SessionStatus.ACTIVE).toBe(false);

        done();
        clearTimeout(caller);
      }, 200);
    });

    it('should call a list of predefined steps inside', (done) => {
      const service: SessionService = TestBed.inject(AwsPlainService);

      // <any> is a trick to spy on private methods!
      spyOn(service,'deApplyCredentials').and.callFake(() => fakePromise);
      spyOn<any>(service,'sessionDeactivated').and.callThrough();

      service.stop('fakeid');

      const caller = setTimeout(() => {
        expect((service).deApplyCredentials).toHaveBeenCalled();
        expect((service as any).sessionDeactivated).toHaveBeenCalled();

        done();
        clearTimeout(caller);
      }, 200);
    });

    it('should manage an error thrown in a child step', (done) => {
      const service: SessionService = TestBed.inject(AwsPlainService);

      // <any> is a trick to spy on private methods!
      spyOn<any>(service, 'sessionError').and.callFake(() => {});
      spyOn(service,'deApplyCredentials').and.callFake(() => fakePromise);
      spyOn<any>(service,'sessionDeactivated').and.callFake(() => {
 throw new LeappNotFoundError(this, 'exploded fake function');
});

      service.stop('fakeid');

      const caller = setTimeout(() => {
        expect((service as any).sessionError).toHaveBeenCalled();

        done();
        clearTimeout(caller);
      }, 200);
    });
  });

  describe('rotate()', () => {
    it('should rotate a session when expired', (done) => {
      const service: SessionService = TestBed.inject(AwsPlainService);

      // <any> is a trick to spy on private methods!
      spyOn<any>(service,'sessionLoading').and.callThrough();
      spyOn<any>(service,'sessionRotated').and.callThrough();
      spyOn(service,'generateCredentials').and.callFake(() => fakePromise);
      spyOn(service,'applyCredentials').and.callFake(() => fakePromise);

      mockedSession.loading = true;
      mockedSession.startDateTime = new Date().toISOString();
      mockedSessions = [mockedSession];

      const previousStartDateTime = mockedSession.startDateTime;

      const caller = setTimeout(() => {
        service.rotate('fakeid');

        const caller2 = setTimeout(() => {
          expect((service as any).sessionLoading).toHaveBeenCalled();
          expect((service as any).generateCredentials).toHaveBeenCalled();
          expect((service as any).applyCredentials).toHaveBeenCalled();
          expect((service as any).sessionRotated).toHaveBeenCalled();

          expect(mockedSession.status).toBe(SessionStatus.ACTIVE);
          expect(service.get('fakeid').startDateTime).not.toBe(previousStartDateTime);
          expect(new Date(service.get('fakeid').startDateTime).getTime()).toBeGreaterThan(new Date(previousStartDateTime).getTime());

          done();
          clearTimeout(caller);
          clearTimeout(caller2);
        }, 100);
      }, 100);
      service.rotate('fakeid');
    });

    it('should call a list of predefined steps inside', (done) => {
      const service: SessionService = TestBed.inject(AwsPlainService);

      // <any> is a trick to spy on private methods!
      spyOn<any>(service,'sessionLoading').and.callThrough();
      spyOn<any>(service,'sessionRotated').and.callThrough();
      spyOn(service,'generateCredentials').and.callFake(() => fakePromise);
      spyOn(service,'applyCredentials').and.callFake(() => fakePromise);

      service.rotate('fakeid');

      const caller = setTimeout(() => {
        expect((service as any).sessionLoading).toHaveBeenCalled();
        expect((service as any).generateCredentials).toHaveBeenCalled();
        expect((service as any).applyCredentials).toHaveBeenCalled();
        expect((service as any).sessionRotated).toHaveBeenCalled();

        done();
        clearTimeout(caller);
      }, 200);
    });

    it('should manage an error thrown in a child step', () => {
      const service: SessionService = TestBed.inject(AwsPlainService);

      // <any> is a trick to spy on private methods!
      spyOn<any>(service, 'sessionError').and.callThrough();
      spyOn<any>(service,'sessionLoading').and.callFake(() => {
 throw new LeappNotFoundError(this, 'exploded fake function');
});

      service.rotate('fakeid');
      expect((service as any).sessionError).toHaveBeenCalled();
    });
  });
});
