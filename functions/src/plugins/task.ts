import * as probot from "probot-ts";

export class Task {
  repositories: FirebaseFirestore.CollectionReference;
  pullRequests: FirebaseFirestore.CollectionReference;
  admin: FirebaseFirestore.CollectionReference;

  constructor(public robot: probot.Robot, public db: FirebaseFirestore.Firestore) {
    this.repositories = this.db.collection('repositories');
    this.pullRequests = this.db.collection('pullRequests');
    this.admin = this.db.collection('admin');
  }

  /**
   * Gets the PR data from Github (or parameter) and adds/updates it in Firebase
   */
  async updateDbPR(github: probot.Context.github, owner: string, repo: string, number: number, repositoryId: number, newData?: any): Promise<any> {
    newData = newData || (await github.pullRequests.get({owner, repo, number})).data;
    const data = {...newData, repository: {owner, name: repo, id: repositoryId}};
    const doc = this.pullRequests.doc(data.id.toString());
    await doc.set(data, {merge: true}).catch(err => {
      this.robot.log.error(err);
      throw err;
    });
    return (await doc.get()).data();
  }
}
