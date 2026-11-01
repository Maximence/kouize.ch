# Sorting Algorithms

A sorting algorithm puts the elements of a list in a given order. Two properties matter beyond speed: a sort is **stable** if equal elements keep their relative order, and **in-place** if it uses only $O(1)$ extra memory.

## Comparison Sorts

Comparison sorts only learn about the data by comparing pairs of elements. Any comparison sort needs $\Omega(n \log n)$ comparisons in the worst case, because there are $n!$ possible orderings and each comparison at best halves the remaining possibilities: $\log_2(n!) = \Theta(n \log n)$.

### Merge Sort

Merge sort splits the list in two halves, sorts each half recursively, then merges the two sorted halves. Its running time follows the recurrence $T(n) = 2T(n/2) + O(n)$, which solves to $O(n \log n)$ in every case. It is stable but not in-place: the merge step needs $O(n)$ extra memory.

```python
def merge_sort(xs):
    if len(xs) <= 1:
        return xs
    mid = len(xs) // 2
    left, right = merge_sort(xs[:mid]), merge_sort(xs[mid:])
    out = []
    # take from the left first on ties: this keeps the sort stable
    while left and right:
        out.append(left.pop(0) if left[0] <= right[0] else right.pop(0))
    return out + left + right
```

### Quicksort

Quicksort picks a **pivot**, partitions the list into elements smaller and larger than the pivot, then sorts both parts recursively. It runs in $O(n \log n)$ on average but degrades to $O(n^2)$ when the pivot is always the smallest or largest element, for example when the input is already sorted and the first element is used as pivot. Choosing a random pivot makes the worst case very unlikely. Quicksort is in-place but not stable.

## Non-Comparison Sorts

When keys are small integers, we can beat the $n \log n$ bound. **Counting sort** counts how many times each key appears and runs in $O(n + k)$, where $k$ is the range of keys. **Radix sort** applies a stable counting sort digit by digit, from the least significant digit to the most significant one.

## Summary

| Algorithm | Best | Average | Worst | Stable | In-place |
|---|---|---|---|---|---|
| Merge sort | $O(n \log n)$ | $O(n \log n)$ | $O(n \log n)$ | Yes | No |
| Quicksort | $O(n \log n)$ | $O(n \log n)$ | $O(n^2)$ | No | Yes |
| Insertion sort | $O(n)$ | $O(n^2)$ | $O(n^2)$ | Yes | Yes |
| Counting sort | $O(n + k)$ | $O(n + k)$ | $O(n + k)$ | Yes | No |

Insertion sort is the best choice for very small or nearly sorted lists, which is why many library sorts (such as Timsort) switch to it for short runs.
