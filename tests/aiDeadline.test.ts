import test from 'node:test'
import assert from 'node:assert/strict'
import { xiangqiWorkerBudget } from '../src/workers/aiDeadline.ts'

test('warm xiangqi workers preserve the requested strength setting', () => {
  const now = 1_000_000
  const deadlineAt = now + 3500
  assert.equal(xiangqiWorkerBudget({ deadlineAt }, now), 3000)
  assert.equal(xiangqiWorkerBudget({ deadlineAt, budgetMs: 700 }, now + 100), 700)
  assert.equal(xiangqiWorkerBudget({ deadlineAt, budgetMs: 1600 }, now + 100), 1600)
  assert.equal(xiangqiWorkerBudget({ deadlineAt, budgetMs: 3000 }, now + 300), 3000)
})

test('slow module loading reduces search time and reserves reply delivery time', () => {
  const now = 1_000_000
  const deadlineAt = now + 3500
  assert.equal(xiangqiWorkerBudget({ deadlineAt, budgetMs: 3000 }, now + 1500), 1900)
  assert.equal(xiangqiWorkerBudget({ deadlineAt, budgetMs: 700 }, now + 3000), 400)
  assert.equal(xiangqiWorkerBudget({ deadlineAt }, deadlineAt - 120), 25)
  assert.equal(xiangqiWorkerBudget({ deadlineAt }, deadlineAt), 25)
  assert.equal(xiangqiWorkerBudget({ deadlineAt }, deadlineAt + 1000), 25)
})

test('standalone and invalid deadlines retain a finite bounded search budget', () => {
  assert.equal(xiangqiWorkerBudget({}), 3000)
  assert.equal(xiangqiWorkerBudget({ budgetMs: 700 }), 700)
  assert.equal(xiangqiWorkerBudget({ budgetMs: 5000 }), 3200)
  assert.equal(xiangqiWorkerBudget({ budgetMs: -5 }), 25)
  assert.equal(xiangqiWorkerBudget({ budgetMs: 0 }), 25)
  assert.equal(xiangqiWorkerBudget({ budgetMs: NaN }), 3000)
  assert.equal(xiangqiWorkerBudget({ budgetMs: Infinity }), 3000)
  assert.equal(xiangqiWorkerBudget({ deadlineAt: NaN }), 3000)
  assert.equal(xiangqiWorkerBudget({ deadlineAt: Infinity, budgetMs: 1600 }), 1600)
})
