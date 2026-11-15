#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateRange(1, 3650)]
    [int]$DaysOld = 7,

    [switch]$IncludeRecycleBin,

    # Without this switch, the script only previews what would be deleted.
    [switch]$Execute
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    throw 'This script must be run on Windows.'
}

if ($IncludeRecycleBin -and -not (Get-Command Clear-RecycleBin -ErrorAction SilentlyContinue)) {
    throw 'Clear-RecycleBin is unavailable. Update PowerShell or omit -IncludeRecycleBin.'
}

function Get-OldTempFile {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][datetime]$Cutoff,
        [Parameter(Mandatory)][string]$ScriptPath
    )

    # Walk directories manually so junctions and symbolic links are never followed.
    $pending = New-Object 'System.Collections.Generic.Stack[string]'
    $pending.Push($Root)

    while ($pending.Count -gt 0) {
        $currentDirectory = $pending.Pop()
        $children = @(Get-ChildItem -LiteralPath $currentDirectory -Force -ErrorAction SilentlyContinue)

        foreach ($child in $children) {
            if (($child.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
                continue
            }

            if ($child.PSIsContainer) {
                $pending.Push($child.FullName)
                continue
            }

            if ($child.LastWriteTime -lt $Cutoff -and $child.FullName -ne $ScriptPath) {
                $child
            }
        }
    }
}

function Get-CRecycleBinPreview {
    $shell = $null
    $bin = $null

    try {
        $shell = New-Object -ComObject Shell.Application
        $bin = $shell.NameSpace(0xA)
        if ($null -eq $bin) {
            throw 'Windows could not open the Recycle Bin.'
        }

        $prefix = $env:SystemDrive + '\' + '$Recycle.Bin' + '\'
        $items = @()

        foreach ($item in $bin.Items()) {
            $itemPath = [string]$item.Path
            if (-not $itemPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
                continue
            }

            $size = 0.0
            try { $size = [double]$item.Size } catch { }

            $items += [pscustomobject]@{
                Name         = [string]$item.Name
                SizeMB       = [math]::Round($size / 1MB, 2)
                InternalPath = $itemPath
            }
        }

        [pscustomobject]@{ Success = $true; Items = $items; Error = '' }
    }
    catch {
        [pscustomobject]@{ Success = $false; Items = @(); Error = $_.Exception.Message }
    }
    finally {
        if ($null -ne $bin) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($bin)
        }
        if ($null -ne $shell) {
            [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
        }
    }
}

$tempDirectories = @()
$rawTempPaths = @($env:TEMP, $env:TMP) |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    Select-Object -Unique

$blockedPaths = @($env:SystemRoot, $env:USERPROFILE, ${env:ProgramFiles}, ${env:ProgramFiles(x86)}, $env:ProgramData) |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    ForEach-Object { $_.TrimEnd('\') }

$protectedRoots = @($env:SystemRoot, ${env:ProgramFiles}, ${env:ProgramFiles(x86)}, $env:ProgramData) |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
    ForEach-Object { $_.TrimEnd('\') }

$systemDriveRoot = [IO.Path]::GetFullPath($env:SystemDrive + '\')

foreach ($path in $rawTempPaths) {
    try {
        $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
        if (-not $item.PSIsContainer) {
            Write-Warning "Skipping a TEMP/TMP path that is not a directory: $path"
            continue
        }

        $fullPath = $item.FullName.TrimEnd('\')
        $pathRoot = [IO.Path]::GetPathRoot($fullPath).TrimEnd('\')

        if ($fullPath -eq $pathRoot -or $blockedPaths -contains $fullPath -or $item.Name -notmatch '^(Temp|Tmp)$') {
            Write-Warning "Skipping an unsafe TEMP/TMP path: $fullPath"
            continue
        }

        if (-not ($fullPath + '\').StartsWith($systemDriveRoot, [StringComparison]::OrdinalIgnoreCase)) {
            Write-Warning "Skipping a TEMP/TMP path outside the system drive: $fullPath"
            continue
        }

        $insideProtectedRoot = $false
        foreach ($rootPath in $protectedRoots) {
            if (($fullPath + '\').StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)) {
                $insideProtectedRoot = $true
                break
            }
        }
        if ($insideProtectedRoot) {
            Write-Warning "Skipping a TEMP/TMP path inside a protected system directory: $fullPath"
            continue
        }

        if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
            Write-Warning "Skipping a TEMP/TMP path that is a link or junction: $fullPath"
            continue
        }

        $tempDirectories += $fullPath
    }
    catch {
        Write-Warning "Cannot access TEMP/TMP path '$path': $($_.Exception.Message)"
    }
}

$tempDirectories = @($tempDirectories | Select-Object -Unique)
$cutoff = (Get-Date).AddDays(-$DaysOld)
$tempFiles = @(
    foreach ($directory in $tempDirectories) {
        Get-OldTempFile -Root $directory -Cutoff $cutoff -ScriptPath $PSCommandPath
    }
)
$tempFiles = @($tempFiles | Sort-Object FullName -Unique)

Write-Host '=== Current-user temporary files ==='
Write-Host ("System drive: {0}   Age filter: older than {1} day(s)" -f $env:SystemDrive, $DaysOld)

$tempBytes = 0.0
if ($tempFiles.Count -eq 0) {
    Write-Host 'No matching temporary files.'
}
else {
    foreach ($file in $tempFiles) {
        $tempBytes += $file.Length
        Write-Host ("{0,12:N2} MB  {1:yyyy-MM-dd HH:mm}  {2}" -f ($file.Length / 1MB), $file.LastWriteTime, $file.FullName)
    }
}
Write-Host ("Subtotal: {0} file(s), {1:N2} MB" -f $tempFiles.Count, ($tempBytes / 1MB))

$canEmptyRecycleBin = $false
$recycleItems = @()

if ($IncludeRecycleBin) {
    Write-Host "`n=== System-drive Recycle Bin ==="
    $preview = Get-CRecycleBinPreview

    if (-not $preview.Success) {
        Write-Warning "Recycle Bin preview failed; it will NOT be emptied. $($preview.Error)"
    }
    else {
        $recycleItems = @($preview.Items)
        if ($recycleItems.Count -eq 0) {
            Write-Host 'The system-drive Recycle Bin is empty.'
        }
        else {
            foreach ($item in $recycleItems) {
                Write-Host ("{0,12:N2} MB  {1}  [{2}]" -f $item.SizeMB, $item.Name, $item.InternalPath)
            }
            Write-Host ("Subtotal: {0} top-level entrie(s)" -f $recycleItems.Count)
            $canEmptyRecycleBin = $true
        }
    }
}

if ($tempFiles.Count -eq 0 -and -not $canEmptyRecycleBin) {
    Write-Host "`nNothing to delete."
    exit 0
}

if (-not $Execute) {
    Write-Host "`nPREVIEW ONLY: nothing was deleted."
    Write-Host 'Rerun with -Execute to delete the listed items.'
    if ($IncludeRecycleBin) {
        Write-Host 'Keep -IncludeRecycleBin on the command only if you also want to empty it.'
    }
    exit 0
}

$answer = Read-Host "`nType DELETE in capital letters to permanently remove the listed items"
if ($answer -cne 'DELETE') {
    Write-Host 'Cancelled. Nothing was deleted.'
    exit 0
}

$deletedCount = 0
$failedCount = 0
$freedBytes = 0.0

foreach ($file in $tempFiles) {
    try {
        # Revalidate immediately before deletion in case the path changed after preview.
        $current = Get-Item -LiteralPath $file.FullName -Force -ErrorAction Stop
        if ($current.PSIsContainer -or
            ($current.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
            $current.LastWriteTime -ge $cutoff) {
            continue
        }

        Remove-Item -LiteralPath $current.FullName -Force -Confirm:$false -ErrorAction Stop
        $deletedCount++
        $freedBytes += $current.Length
    }
    catch {
        $failedCount++
        Write-Warning "Skipped '$($file.FullName)': $($_.Exception.Message)"
    }
}

Write-Host ("`nDeleted {0} temporary file(s); freed approximately {1:N2} MB." -f $deletedCount, ($freedBytes / 1MB))
if ($failedCount -gt 0) {
    Write-Host "$failedCount file(s) could not be deleted and were skipped."
}

if ($canEmptyRecycleBin) {
    try {
        Clear-RecycleBin -DriveLetter ($env:SystemDrive.TrimEnd(':')) -Force -Confirm:$false -ErrorAction Stop
        Write-Host "The $($env:SystemDrive) Recycle Bin was emptied."
    }
    catch {
        Write-Warning "The Recycle Bin could not be emptied: $($_.Exception.Message)"
    }
}

Write-Host 'Done.'
