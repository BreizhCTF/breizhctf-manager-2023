import {ChallengeConfigStoreRepository} from '.';
import {Challenge, KubeIsolatedChallenge} from '../../types/Challenge';
import {ADD, CHANGE, CustomObjectsApi, DELETE, Informer, KubeConfig, ListPromise, makeInformer, UPDATE, Watch} from '@kubernetes/client-node';
import {API_GROUP} from '../../strings';
import NodeCache from 'node-cache';

export class KubernetesRepository implements ChallengeConfigStoreRepository {
  private customObjectsApi: CustomObjectsApi;

  constructor(private cache: NodeCache, private cfg: KubeConfig) {
    this.customObjectsApi = cfg.makeApiClient(CustomObjectsApi);
  }

  async get(name: string): Promise<Challenge | null> {
    let chal: Challenge | null = this.cache.get(name) as unknown as Challenge;
    if (!chal) {
      chal = await this._get(name);
      this.cache.set(name, chal);
    }
    return chal;
  }

  async watch(cb: (event: string, arg: Challenge) => any) {
    const startWatch = async () => new Promise(resolve => new Watch(this.cfg)
      .watch('/apis/kube-ctf.downunderctf.com/v1/isolated-challenges', {}, (phase, obj) => {
        cb(phase, {
          name: obj.metadata.name,
          expires: obj.spec.expires,
          available_at: obj.spec.available_at,
          template: obj.spec.template,
          type: obj.spec.type,
          updated_at: 0,
        });
      }, (err) => resolve(false)));
    
    while(true) {
      await startWatch();
    }

    // const informer = makeInformer(this.cfg, '/apis/kube-ctf.downunderctf.com/v1/isolated-challenges', () => this._getAll());

    // const mapBody = (body: any) => ({
    //   name: body.metadata.name,
    //   expires: body.spec.expires,
    //   available_at: body.spec.available_at,
    //   template: body.spec.template,
    //   type: body.spec.type,
    //   updated_at: 0,
    // });

    // informer.on('add', (body: any) => cb(UPDATE, mapBody(body)));
    // informer.on('add', (body) => cb(ADD, mapBody(body)))
    // informer.on('delete', (body) => cb(DELETE, mapBody(body)))

    // informer.start();

    // return informer;
  }

  private async _get(name: string): Promise<Challenge | null> {
    return this.customObjectsApi
      .getClusterCustomObject(API_GROUP, 'v1', 'isolated-challenges', name)
      .then(response => {
        const body = response.body as KubeIsolatedChallenge;
        return {
          name: body.metadata.name,
          expires: body.spec.expires,
          available_at: body.spec.available_at,
          template: body.spec.template,
          type: body.spec.type,
          updated_at: 0,
        };
      })
      .catch(e => {
        console.error(e.message);
        return null;
      });
  }

  private async _getAll() {
    return this.customObjectsApi.listClusterCustomObject(API_GROUP, 'v1', 'isolated-challenges').then(r => r as any);
  }
}
