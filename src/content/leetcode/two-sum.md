---
title: "Two Sum"
problemUrl: "https://leetcode.com/problems/two-sum/"
difficulty: "Easy"
pubDate: "2025-12-30"
tags: ["array", "hash-table"]
complexity:
  time: "O(n)"
  space: "O(n)"
---

# Two Sum

## Problema
Dado un array de enteros `nums` y un entero `target`, retorna los índices de los dos números tales que sumen `target`.

## Solución
Utilizamos un Hash Map para almacenar el complemento de cada número mientras iteramos...

```typescript
function twoSum(nums: number[], target: number): number[] {
    const map = new Map<number, number>();
    for (let i = 0; i < nums.length; i++) {
        const complement = target - nums[i];
        if (map.has(complement)) {
            return [map.get(complement)!, i];
        }
        map.set(nums[i], i);
    }
    return [];
}
```
