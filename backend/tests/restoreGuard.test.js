import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../src/config/database.js';
import {restoreGuard,restoreLockName} from '../src/middlewares/restoreGuard.js';
after(()=>pool.end());
test('shared database maintenance lock rejects writes but allows reads',async t=>{
 let checks=0,next=0,status,payload;
 t.mock.method(pool,'execute',async(sql,args)=>{checks++;assert.match(sql,/IS_USED_LOCK/);assert.equal(args[0],restoreLockName());return [[{restore_owner:123}]];});
 const res={status(code){status=code;return this;},json(body){payload=body;}};
 await restoreGuard({method:'POST'},res,()=>next++);
 assert.equal(status,503);assert.equal(payload.error.code,'RESTORE_IN_PROGRESS');assert.equal(next,0);
 await restoreGuard({method:'GET'},res,()=>next++);assert.equal(next,1);assert.equal(checks,1);
});
test('maintenance check fails closed when database cannot be reached',async t=>{
 const failure=Object.assign(Error('offline'),{code:'ECONNREFUSED'});let forwarded;
 t.mock.method(pool,'execute',async()=>{throw failure;});
 await restoreGuard({method:'PATCH'},{},e=>forwarded=e);assert.equal(forwarded,failure);
});
