// Vercel serverless function — secure token source verification.
// Holds ONE Etherscan v2 key (yours) as a server secret so users never need their own.
// Set ETHERSCAN_API_KEY in Vercel: Project -> Settings -> Environment Variables.

const SOURCE = "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.20;\n\n/// @title OpenHelixToken\n/// @notice Standard, self-contained ERC-20. Supply is minted to `mintTo` at deploy.\n/// @dev No external imports => fully deterministic, easy to verify on explorers.\ncontract OpenHelixToken {\n    string public name;\n    string public symbol;\n    uint8 public immutable decimals;\n    uint256 public totalSupply;\n    address public owner;\n\n    mapping(address => uint256) public balanceOf;\n    mapping(address => mapping(address => uint256)) public allowance;\n\n    event Transfer(address indexed from, address indexed to, uint256 value);\n    event Approval(address indexed owner, address indexed spender, uint256 value);\n    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);\n\n    constructor(\n        string memory _name,\n        string memory _symbol,\n        uint8 _decimals,\n        uint256 _initialSupply,\n        address _mintTo\n    ) {\n        require(_mintTo != address(0), \"OHX: mintTo zero\");\n        name = _name;\n        symbol = _symbol;\n        decimals = _decimals;\n        owner = _mintTo;\n        uint256 supply = _initialSupply * (10 ** uint256(_decimals));\n        totalSupply = supply;\n        balanceOf[_mintTo] = supply;\n        emit Transfer(address(0), _mintTo, supply);\n        emit OwnershipTransferred(address(0), _mintTo);\n    }\n\n    function transfer(address to, uint256 value) external returns (bool) {\n        _transfer(msg.sender, to, value);\n        return true;\n    }\n\n    function approve(address spender, uint256 value) external returns (bool) {\n        allowance[msg.sender][spender] = value;\n        emit Approval(msg.sender, spender, value);\n        return true;\n    }\n\n    function transferFrom(address from, address to, uint256 value) external returns (bool) {\n        uint256 allowed = allowance[from][msg.sender];\n        require(allowed >= value, \"OHX: insufficient allowance\");\n        if (allowed != type(uint256).max) {\n            allowance[from][msg.sender] = allowed - value;\n            emit Approval(from, msg.sender, allowed - value);\n        }\n        _transfer(from, to, value);\n        return true;\n    }\n\n    function burn(uint256 value) external {\n        uint256 bal = balanceOf[msg.sender];\n        require(bal >= value, \"OHX: burn exceeds balance\");\n        unchecked { balanceOf[msg.sender] = bal - value; totalSupply -= value; }\n        emit Transfer(msg.sender, address(0), value);\n    }\n\n    function renounceOwnership() external {\n        require(msg.sender == owner, \"OHX: not owner\");\n        emit OwnershipTransferred(owner, address(0));\n        owner = address(0);\n    }\n\n    function _transfer(address from, address to, uint256 value) internal {\n        require(to != address(0), \"OHX: transfer to zero\");\n        uint256 bal = balanceOf[from];\n        require(bal >= value, \"OHX: transfer exceeds balance\");\n        unchecked { balanceOf[from] = bal - value; balanceOf[to] += value; }\n        emit Transfer(from, to, value);\n    }\n}\n";
const COMPILER = "v0.8.26+commit.8a97fa7a";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return res.status(200).json({ ok: false, error: "Server missing ETHERSCAN_API_KEY" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const { mode, chainid, address, constructorArgs, guid } = body || {};
  const base = `https://api.etherscan.io/v2/api?chainid=${chainid || 56}`;

  try {
    if (mode === "submit") {
      if (!address) return res.json({ ok: false, error: "address required" });
      const form = new URLSearchParams({
        apikey: key, module: "contract", action: "verifysourcecode",
        contractaddress: address, sourceCode: SOURCE, codeformat: "solidity-single-file",
        contractname: "OpenHelixToken", compilerversion: COMPILER,
        optimizationUsed: "1", runs: "200", evmversion: "paris",
        constructorArguements: constructorArgs || ""
      });
      const r = await (await fetch(base, { method: "POST", body: form })).json();
      if (r.status !== "1") {
        if (String(r.result).toLowerCase().includes("already verified")) return res.json({ ok: true, already: true });
        return res.json({ ok: false, error: r.result });
      }
      return res.json({ ok: true, guid: r.result });
    }

    if (mode === "status") {
      const r = await (await fetch(`${base}&module=contract&action=checkverifystatus&guid=${guid}&apikey=${key}`)).json();
      const result = String(r.result);
      if (result.includes("Pending")) return res.json({ status: "pending" });
      if (r.status === "1" || result.includes("Already Verified")) return res.json({ ok: true });
      return res.json({ ok: false, error: result });
    }

    return res.json({ ok: false, error: "unknown mode" });
  } catch (e) {
    return res.json({ ok: false, error: e.message || "request failed" });
  }
}
