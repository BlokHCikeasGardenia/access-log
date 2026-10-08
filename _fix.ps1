

# Fix HomeView.vue indentation
# Fix HomeView.vue indentation around filteredLogs block
$in = 'src/views/HomeView.vue'
$lines = [System.IO.File]::ReadAllText($in)
$idx = $lines.IndexOf('filteredLogs.length')
$chunk = $lines.Substring($idx - 25, 70)
[System.IO.File]::WriteAllText('diag.txt', $chunk, [System.Text.Encoding]::UTF8)
Write-Host 'WROTE diag.txt'
Write-Host 'chars around filteredLogs.length:'
Write-Host ($chunk | Out-String)
$lines = Get-Content -Raw -Path $in -Encoding utf8

$old = "                <div`r`n      v-if=`"filteredLogs.length`"`r`n      class=`"flex items-center justify-between mb-3 text-sm text-slate-600`"`r`n    >`r`n      <span>`r`n        Menampilkan {{ (currentPage - 1) * pageSize + 1 }}–{{`r`n          Math.min(currentPage * pageSize, filteredLogs.length)`r`n        }}`r`n        dari {{ filteredLogs.length }} data`r`n      </span>`r`n      <span>`r`n        Halaman {{ currentPage }} / {{ totalPages }}`r`n      </span>`r`n    </div>`r`n    <div v-else-if=`"logs.length`" class=`"mb-3 text-sm text-slate-600`">`r`n      0 data (setelah filter)`r`n    </div>"
"
