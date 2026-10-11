# Generates self-signed SSL certificates for CloudPilot Staging environment
$ErrorActionPreference = "Stop"

$certsDir = Join-Path $PSScriptRoot "..\docker\nginx\certs"
if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir -Force | Out-Null
}

$certPath = Join-Path $certsDir "staging.crt"
$keyPath = Join-Path $certsDir "staging.key"

Write-Host "Generating self-signed SSL certificate for CloudPilot Staging..."

$cert = New-SelfSignedCertificate `
    -Subject "CN=cloudpilot.local" `
    -DnsName "localhost", "cloudpilot.local", "staging.cloudpilot.local", "127.0.0.1" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -KeyExportPolicy Exportable `
    -KeySpec Signature `
    -KeyLength 2048 `
    -KeyAlgorithm RSA `
    -HashAlgorithm SHA256 `
    -NotAfter (Get-Date).AddYears(5)

$certBytes = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert)
$certPem = "-----BEGIN CERTIFICATE-----`r`n" + [System.Convert]::ToBase64String($certBytes, [System.Base64FormattingOptions]::InsertLineBreaks) + "`r`n-----END CERTIFICATE-----`r`n"

$rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
$keyBytes = $rsa.ExportPkcs8PrivateKey()
$keyPem = "-----BEGIN PRIVATE KEY-----`r`n" + [System.Convert]::ToBase64String($keyBytes, [System.Base64FormattingOptions]::InsertLineBreaks) + "`r`n-----END PRIVATE KEY-----`r`n"

[System.IO.File]::WriteAllText($certPath, $certPem)
[System.IO.File]::WriteAllText($keyPath, $keyPem)

# Cleanup from CurrentUser store
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store "My", "CurrentUser"
$store.Open("ReadWrite")
$store.Remove($cert)
$store.Close()

Write-Host "Successfully generated staging SSL certificates:"
Write-Host " - Certificate: $certPath"
Write-Host " - Private Key: $keyPath"
