$f = 'src/views/HomeView.vue'
$c = [System.IO.File]::ReadAllText($f)
$ok4 = "    <div`r`n      v-if=`"filteredLogs.length`""
$ok8 = "        <div`r`n      v-if=`"filteredLogs.length`""
if ($c.Contains($ok4)) { Write-Host 'FOUND-4SP' } elseif ($c.Contains($ok8)) { Write-Host 'FOUND-8SP' } else { Write-Host 'NOT-FOUND' }
