class WriteResult implements FirebaseFirestore.WriteResult {
  writeTime: string;

  constructor() {
    this.writeTime = new Date().toISOString();
  }
}

class DocumentReference implements FirebaseFirestore.DocumentReference {
  id: string;
  firestore: FirebaseFirestore.Firestore;
  parent: FirebaseFirestore.CollectionReference;
  path: string;
  private _data: any;

  constructor(firestore: FirebaseFirestore.Firestore, path) {
    this.firestore = firestore;
    this.path = path;
  }

  collection(collectionPath: string): FirebaseFirestore.CollectionReference {
    throw new Error("Method not implemented.");
  }

  getCollections(): Promise<FirebaseFirestore.CollectionReference[]> {
    throw new Error("Method not implemented.");
  }

  create(data: FirebaseFirestore.DocumentData): Promise<FirebaseFirestore.WriteResult> {
    throw new Error("Method not implemented.");
  }

  set(data: FirebaseFirestore.DocumentData, options?: FirebaseFirestore.SetOptions): Promise<FirebaseFirestore.WriteResult> {
    this._data = data;
    return Promise.resolve(new WriteResult());
  }

  update(data: any, precondition?: any, ...rest: any[]): Promise<FirebaseFirestore.WriteResult> {
    throw new Error("Method not implemented.");
  }

  delete(precondition?: FirebaseFirestore.Precondition): Promise<FirebaseFirestore.WriteResult> {
    throw new Error("Method not implemented.");
  }

  get(): Promise<FirebaseFirestore.DocumentSnapshot> {
    return Promise.resolve(this._data);
  }

  onSnapshot(onNext: (snapshot: FirebaseFirestore.DocumentSnapshot) => void, onError?: (error: Error) => void): () => void {
    throw new Error("Method not implemented.");
  }
}

/*class DocumentSnapshot implements FirebaseFirestore.DocumentSnapshot {
  exists: boolean;
  ref: FirebaseFirestore.DocumentReference;
  id: string;
  createTime?: string;
  updateTime?: string;
  readTime: string;
  private _data: any;

  constructor(data: any) {
    this._data = data;
  }

  data(): FirebaseFirestore.DocumentData {
    return this._data;
  }

  get(fieldPath: string | FirebaseFirestore.FieldPath) {
    throw new Error("Method not implemented.");
  }
}*/

class QuerySnapshot implements FirebaseFirestore.QuerySnapshot {
  query: FirebaseFirestore.Query;
  docChanges: FirebaseFirestore.DocumentChange[];
  docs: FirebaseFirestore.DocumentSnapshot[];
  size: number;
  empty: boolean;
  readTime: string;

  constructor(query: Query, docs: FirebaseFirestore.DocumentSnapshot[]) {
    this.query = query;
    this.docs = docs;
  }

  forEach(callback: (result: FirebaseFirestore.DocumentSnapshot) => void, thisArg?: any): void {
    this.docs.forEach(callback);
  }
}

class Query implements FirebaseFirestore.Query {
  firestore: FirebaseFirestore.Firestore;
  collection: FirebaseFirestore.CollectionReference;

  constructor(firestore: FirebaseFirestore.Firestore, collection: FirebaseFirestore.CollectionReference) {
    this.firestore = firestore;
    this.collection = collection;
  }

  where(fieldPath: string | FirebaseFirestore.FieldPath, opStr: FirebaseFirestore.WhereFilterOp, value: any): FirebaseFirestore.Query {
    return this;
  }

  orderBy(fieldPath: string | FirebaseFirestore.FieldPath, directionStr?: FirebaseFirestore.OrderByDirection): FirebaseFirestore.Query {
    return this;
  }

  limit(limit: number): FirebaseFirestore.Query {
    return this;
  }

  offset(offset: number): FirebaseFirestore.Query {
    return this;
  }

  select(...field: (string | FirebaseFirestore.FieldPath)[]): FirebaseFirestore.Query {
    return this;
  }

  startAt(...fieldValues: any[]): FirebaseFirestore.Query {
    return this;
  }

  startAfter(...fieldValues: any[]): FirebaseFirestore.Query {
    return this;
  }

  endBefore(...fieldValues: any[]): FirebaseFirestore.Query {
    return this;
  }

  endAt(...fieldValues: any[]): FirebaseFirestore.Query {
    return this;
  }

  get(): Promise<FirebaseFirestore.QuerySnapshot> {
    return this.collection.get();
  }

  stream(): NodeJS.ReadableStream {
    throw new Error("Method not implemented.");
  }

  onSnapshot(onNext: (snapshot: FirebaseFirestore.QuerySnapshot) => void, onError?: (error: Error) => void): () => void {
    throw new Error("Method not implemented.");
  }
}

class Collection implements FirebaseFirestore.CollectionReference {
  firestore: FirebaseFirestore.Firestore;
  id: string;
  parent: FirebaseFirestore.DocumentReference;
  path: string;
  private _documents = new Map<string, FirebaseFirestore.DocumentReference>();

  constructor(firestore: FirebaseFirestore.Firestore, path: string) {
    this.path = path;
    this.firestore = firestore;
  }

  doc(documentPath?: string): FirebaseFirestore.DocumentReference {
    if(this._documents.has(documentPath)) {
      return this._documents.get(documentPath);
    }
    const doc = new DocumentReference(this.firestore, documentPath);
    this._documents.set(documentPath, doc);
    return doc;
  }

  add(data: FirebaseFirestore.DocumentData): Promise<FirebaseFirestore.DocumentReference> {
    throw new Error("Method not implemented.");
  }


  where(fieldPath: string | FirebaseFirestore.FieldPath, opStr: FirebaseFirestore.WhereFilterOp, value: any): FirebaseFirestore.Query {
    return new Query(this.firestore, this);
  }

  orderBy(fieldPath: string | FirebaseFirestore.FieldPath, directionStr?: FirebaseFirestore.OrderByDirection): FirebaseFirestore.Query {
    throw new Error("Method not implemented.");
  }

  limit(limit: number): FirebaseFirestore.Query {
    throw new Error("Method not implemented.");
  }

  offset(offset: number): FirebaseFirestore.Query {
    throw new Error("Method not implemented.");
  }

  select(...field: (string | FirebaseFirestore.FieldPath)[]): FirebaseFirestore.Query {
    throw new Error("Method not implemented.");
  }

  startAt(...fieldValues: any[]): FirebaseFirestore.Query {
    throw new Error("Method not implemented.");
  }

  startAfter(...fieldValues: any[]): FirebaseFirestore.Query {
    throw new Error("Method not implemented.");
  }

  endBefore(...fieldValues: any[]): FirebaseFirestore.Query {
    throw new Error("Method not implemented.");
  }

  endAt(...fieldValues: any[]): FirebaseFirestore.Query {
    throw new Error("Method not implemented.");
  }

  async get(): Promise<FirebaseFirestore.QuerySnapshot> {
    const docs = await Promise.all(
      Array.from(this._documents.values())
      .map(async (doc: FirebaseFirestore.DocumentReference) => await doc.get())
    );
    return Promise.resolve(new QuerySnapshot(new Query(this.firestore, this), docs));
  }

  stream(): NodeJS.ReadableStream {
    throw new Error("Method not implemented.");
  }

  onSnapshot(onNext: (snapshot: FirebaseFirestore.QuerySnapshot) => void, onError?: (error: Error) => void): () => void {
    throw new Error("Method not implemented.");
  }
}

export class MockFirestore implements FirebaseFirestore.Firestore {
  private _collections = new Map<string, FirebaseFirestore.CollectionReference>();

  collection(collectionPath: string): FirebaseFirestore.CollectionReference {
    if(this._collections.has(collectionPath)) {
      return this._collections.get(collectionPath);
    }
    const collection = new Collection(this, collectionPath);
    this._collections.set(collectionPath, collection);
    return collection;
  }

  doc(documentPath: string): FirebaseFirestore.DocumentReference {
    throw new Error("Method not implemented.");
  }

  getAll(...documentRef: FirebaseFirestore.DocumentReference[]): Promise<FirebaseFirestore.DocumentSnapshot[]> {
    throw new Error("Method not implemented.");
  }

  getCollections(): Promise<FirebaseFirestore.CollectionReference[]> {
    throw new Error("Method not implemented.");
  }

  runTransaction<T>(updateFunction: (transaction: FirebaseFirestore.Transaction) => Promise<T>): Promise<T> {
    throw new Error("Method not implemented.");
  }

  batch(): FirebaseFirestore.WriteBatch {
    throw new Error("Method not implemented.");
  }
}
