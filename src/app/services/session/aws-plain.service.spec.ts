import {TestBed} from '@angular/core/testing';

import {AwsPlainService} from './aws-plain.service';
import {mustInjected} from '../../../base-injectables';
import {serialize} from 'class-transformer';
import {Workspace} from '../../models/workspace';
import {AppService} from '../app.service';
import {FileService} from '../file.service';
import {WorkspaceService} from '../workspace.service';
import {Session} from '../../models/session';
import {KeychainService} from '../keychain.service';
import {environment} from '../../../environments/environment';
import {LeappNotFoundError} from '../../errors/leapp-not-found-error';
import AWS from 'aws-sdk';
import {LeappBaseError} from '../../errors/leapp-base-error';

let spyAppService;
let spyFileService;
let spyWorkspaceService;
let spyKeychainService;
let awsSpy;

let awsPlainService: AwsPlainService;

let mockedSessions: Session[] = [];
let mockedSecret;
let mockedCredentialObject;

describe('AwsPlainService', () => {

  beforeEach(() => {
    spyAppService = jasmine.createSpyObj('AppService', ['getOS', 'awsCredentialPath', 'stsOptions']);
    spyAppService.getOS.and.returnValue({ homedir : () => '~/testing' });
    spyAppService.awsCredentialPath.and.returnValue('~/.aws');
    spyAppService.stsOptions.and.returnValue({});

    spyFileService = jasmine.createSpyObj('FileService', [
      'encryptText', 'decryptText', 'iniWriteSync', 'iniParseSync',
      'replaceWriteSync', 'writeFileSync', 'readFileSync', 'exists', 'newDir'
    ]);
    spyFileService.exists.and.returnValue(true);
    spyFileService.newDir.and.returnValue(true);
    spyFileService.encryptText.and.callFake((text: string) => text);
    spyFileService.decryptText.and.callFake((text: string) => text);
    spyFileService.writeFileSync.and.callFake((_: string, __: string) => {});
    spyFileService.readFileSync.and.callFake((_: string) => serialize(new Workspace()) );
    spyFileService.iniWriteSync.and.callFake((_: string, object: { }) => {
      mockedCredentialObject = object;
    });

    spyWorkspaceService = jasmine.createSpyObj('WorkspaceService', ['addSession', 'getProfileName']);
    spyWorkspaceService.addSession.and.callFake((session: Session) => {
 mockedSessions.push(session); 
});
    spyWorkspaceService.getProfileName.and.returnValue('default');

    spyKeychainService = jasmine.createSpyObj('KeychainService' , ['saveSecret', 'getSecret']);
    spyKeychainService.saveSecret.and.callFake((name: string, account: string, secret: string) => {
      mockedSecret = {};
      mockedSecret[name] = {};
      mockedSecret[name][account] = secret;
    });

    spyKeychainService.getSecret.and.callFake((name: string, account: string, secret: string) => 'fake-secret');

    awsSpy = jasmine.createSpyObj('AWS.STS', ['getSessionToken']);
    awsSpy.getSessionToken.and.returnValue(new LeappNotFoundError('test', 'mega error'));

    TestBed.configureTestingModule({
      providers: [
        { provide: WorkspaceService, useValue: spyWorkspaceService },
        { provide: AppService, useValue: spyAppService },
        { provide: FileService, useValue: spyFileService },
        { provide: KeychainService, useValue: spyKeychainService },
        { provide: AWS.STS, useValue: awsSpy }
      ].concat(mustInjected())
    });

    awsPlainService = TestBed.inject(AwsPlainService);
  });

  it('should be created', () => {
    const service: AwsPlainService = TestBed.inject(AwsPlainService);
    expect(service).toBeTruthy();
  });

  describe('create()', () => {
    it('should create a new Account of type Plain', () => {
      mockedSessions = [];
      awsPlainService.create({accountName: 'fakeaccount', region: 'eu-west-1', accessKey: 'access-key', secretKey: 'secret-key'}, 'default');

      expect(spyWorkspaceService.addSession).toHaveBeenCalled();
      expect(mockedSessions.length).toBe(1);
      expect(spyKeychainService.saveSecret).toHaveBeenCalledTimes(2);
      expect(spyKeychainService.saveSecret).toHaveBeenCalledWith(environment.appName, `${mockedSessions[0].sessionId}-plain-aws-session-access-key-id`, 'access-key');
      expect(spyKeychainService.saveSecret).toHaveBeenCalledWith(environment.appName, `${mockedSessions[0].sessionId}-plain-aws-session-secret-access-key`, 'secret-key');
    });
  });

  describe('applyCredentials()', () => {
    it('should apply the set of credential to the profile', (done) => {
      mockedSessions = [];
      awsPlainService.create({accountName: 'fakeaccount', region: 'eu-west-1', accessKey: 'access-key', secretKey: 'secret-key'}, 'default');

      spyOn(awsPlainService, 'get').and.callFake((_: string) => mockedSessions[0]);

      const credentialsInfo = {
        sessionToken: {
          aws_access_key_id: 'access-key',
          aws_secret_access_key: 'secret-key',
          aws_session_token: 'sessionToken'
        }
      };

      awsPlainService.applyCredentials(mockedSessions[0].sessionId, credentialsInfo);

      const caller = setTimeout(()=> {
        expect(awsPlainService.get).toHaveBeenCalled();
        expect(spyFileService.iniWriteSync).toHaveBeenCalledTimes(1);
        expect(spyFileService.iniWriteSync).toHaveBeenCalledWith('~/.aws', {
          default: {
            aws_access_key_id: credentialsInfo.sessionToken.aws_access_key_id,
            aws_secret_access_key: credentialsInfo.sessionToken.aws_secret_access_key,
            aws_session_token: credentialsInfo.sessionToken.aws_session_token,
            region: 'eu-west-1'
          }
        });
        done();
        clearTimeout(caller);
      }, 200);
    });
  });

  describe('deApplyCredentials()', () => {
    it('should remove the set of credential to the profile', (done) => {
      mockedSessions = [];
      awsPlainService.create({accountName: 'fakeaccount', region: 'eu-west-1', accessKey: 'access-key', secretKey: 'secret-key'}, 'default');

      spyOn(awsPlainService, 'get').and.callFake((sessionId: string) => mockedSessions[0]);

      const credentialsInfo = {
        sessionToken: {
          aws_access_key_id: 'access-key',
          aws_secret_access_key: 'secret-key',
          aws_session_token: 'sessionToken'
        }
      };

      const credentialFakeObject = {
        default: {
          aws_access_key_id: credentialsInfo.sessionToken.aws_access_key_id,
          aws_secret_access_key: credentialsInfo.sessionToken.aws_secret_access_key,
          aws_session_token: credentialsInfo.sessionToken.aws_session_token,
          region: 'eu-west-1'
        }
      };

      spyFileService.iniParseSync.and.callFake( () => credentialFakeObject);
      spyFileService.replaceWriteSync.and.callFake( () => {});

      awsPlainService.deApplyCredentials(mockedSessions[0].sessionId);

      const caller = setTimeout(()=> {
        expect(awsPlainService.get).toHaveBeenCalled();
        expect(spyFileService.iniParseSync).toHaveBeenCalledTimes(1);
        expect(spyFileService.replaceWriteSync).toHaveBeenCalledWith('~/.aws', {});
        done();
        clearTimeout(caller);
      }, 200);
    });
  });

  describe('generateCredentials()',  () => {
    it('should generate a Credential Info Promise', async () => {
      awsSpy.getSessionToken.and.returnValue({
        Credentials: {
          AccessKeyId: 'access-key-id-1',
          SecretAccessKey: 'secret-key-1',
          SessionToken: 'session-token'
        }
      });

      mockedSessions = [];
      awsPlainService.create({accountName: 'fakeaccount', region: 'eu-west-1', accessKey: 'access-key', secretKey: 'secret-key'}, 'default');

      spyOn(awsPlainService, 'get').and.callFake((_: string) => mockedSessions[0]);
      spyOn(awsPlainService, 'generateCredentials').and.callThrough();

      const credentials = await awsPlainService.generateCredentials('fakeid');
      expect(credentials).toEqual({
        sessionToken: {
          aws_access_key_id: 'access-key-id-1',
          aws_secret_access_key: 'secret-key-1',
          aws_session_token: 'session-token',
        }
      });
    });

    it('should manage Error in its proper way and thrown the info up one level short after', async () => {
      mockedSessions = [];
      awsPlainService.create({accountName: 'fakeaccount', region: 'eu-west-1', accessKey: 'access-key', secretKey: 'secret-key'}, 'default');

      spyOn(awsPlainService, 'get').and.callFake((_: string) => mockedSessions[0]);
      spyOn(awsPlainService, 'generateCredentials').and.callThrough();

      // Trick to test throwing error: basically we catch the error and confront it instead of checking throwError
      // https://stackoverflow.com/questions/44876306/jasmine-expecting-error-to-be-thrown-in-a-async-function
      let error;
      try {
        await awsPlainService.generateCredentials('fakeid');
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(LeappBaseError);
    });
  });
});
