import {Context, Robot} from "probot-ts";
import {OctokitWithPagination} from "probot-ts/lib/github";

export class Task {
  repositories: FirebaseFirestore.CollectionReference;
  pullRequests: FirebaseFirestore.CollectionReference;
  admin: FirebaseFirestore.CollectionReference;

  constructor(public robot: Robot, public db: FirebaseFirestore.Firestore) {
    this.repositories = this.db.collection('repositories');
    this.pullRequests = this.db.collection('pullRequests');
    this.admin = this.db.collection('admin');
  }

  /**
   * Gets the PR data from Github (or parameter) and adds/updates it in Firebase
   */
  async updateDbPR(github: OctokitWithPagination, owner: string, repo: string, number: number, repositoryId: number, newData?: any): Promise<any> {
    newData = newData || (await github.pullRequests.get({owner, repo, number})).data;
    const data = {...newData, repository: {owner, name: repo, id: repositoryId}};
    const doc = this.pullRequests.doc(data.id.toString());
    await doc.set(data, {merge: true}).catch(err => {
      this.robot.log.error(err);
      throw err;
    });
    return (await doc.get()).data();
  }

  // wrapper for this.robot.on
  dispatch(events: string | string[], callback: (context: Context) => any) {
    this.robot.on(events, (context: Context) => {
      this.log({context}, "Event received");
      return callback(context);
    });
  }

  log(...content: any[]) {
    this.robot.log.info(...content);
  }

  logInfo(...content: any[]) {
    this.log(...content);
  }

  logError(...content: any[]) {
    this.robot.log.error(...content);
  }

  logWarn(...content: any[]) {
    this.robot.log.warn(...content);
  }

  logDebug(...content: any[]) {
    this.robot.log.debug(...content);
  }
}
