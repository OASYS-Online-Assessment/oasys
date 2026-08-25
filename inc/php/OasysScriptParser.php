<?php


	class OasysScriptParser {

		/*
		 * parse script source code so as to structure it and make it easy to apply the rules
		 */

		public static function parse($src): array {
			$script = [];
			$lines = preg_split("/\n/", $src);
			$cmdCaptures = [];
			foreach ($lines as $line) {
				$cmd = [];
				$ifElsePattern = "/if\s*\(\s*(?<condition>[^)]+)\)\s*\{(?<ifactions>[^}]+)\}\s*else\s*\{(?<elseactions>[^}]+)\}/i";
				$ifPattern = "/if\s*\(\s*(?<condition>[^)]+)\)\s*\{(?<ifactions>[^}]+)\}/i";
				$executePattern = "/execute\s*\{(?<actions>[^}]+)\}/i";
				if (preg_match($ifElsePattern, $line, $cmdCaptures) > 0) {
					$cmd['type'] = 'if';
					$cmd['conditions'] = self::splitConditions($cmdCaptures['condition']);
					$cmd['if'] = self::splitActions($cmdCaptures['ifactions']);
					$cmd['else'] = self::splitActions($cmdCaptures['elseactions']);
				} elseif (preg_match($ifPattern, $line, $cmdCaptures) > 0) {
					$cmd['type'] = 'if';
					$cmd['conditions'] = self::splitConditions($cmdCaptures['condition']);
					$cmd['if'] = self::splitActions($cmdCaptures['ifactions']);
				} elseif (preg_match($executePattern, $line, $cmdCaptures) > 0) {
					$cmd['type'] = 'execute';
					$cmd['actions'] = self::splitActions($cmdCaptures['actions']);
				}
				$script['commands'][] = $cmd;
			}
			return $script;
		}

		private static function splitConditions($conditions): array {
			$list = [];
			$pattern = "/(.*?)(&&|\|\|)(.*)/";
			do {
				$found = preg_match($pattern, $conditions, $matches);
				if ($found) {
					$cond = ['condition' => $matches[1], 'logic' => $matches[2]];
					$conditions = $matches[3];
				} else {
					$cond = ['condition' => $conditions];
				}
				$cond['condition'] = self::parseCondition($cond['condition']);
				$list[] = $cond;
			} while ($found === 1);

			return $list;
		}

		private static function parseCondition($cond): array {
			$pattern = '/^\s*(([\'"])|\\${0,2})([^\2]*?)(?(2)\2|)\s*(==|!=|>=|<=|>|<|contains|!contains)\s*(([\'"])|\\${0,2})([^\6]*?)(?(6)\6|)\s*$/';
			/*
			 * group 1 => ' or " or $ or $$ or term 1
			 * group 2 => used internally in the pattern, of no use here
			 * group 3 => string, number or name of variable of term 1
			 * group 4 => operator
			 * group 5 => ' or " or $ or $$ or term 2
			 * group 6 => used internally in the pattern, of no use here
			 * group 7 => string, number or name of variable of term 2
			 */
			$parsed = [];
			if (preg_match($pattern, $cond, $matches)) {
				$parsed['operator'] = $matches[4];
				$term1 = $matches[3];
				$term2 = $matches[7];

				switch($matches[1]) {
					case '"':
					case "'":
						$type1 = 'string';
						break;
					case '$$':
						$type1 = 'localVariable';
						break;
					case '$':
						$type1 = 'globalVariable';
						break;
					default:
						if (is_numeric($term1)) {
							if (intval($term1) == floatval($term1)) {
								$type1 = 'int';
								$term1 = intval($term1);
							} else {
								$term1 = floatval($term1);
								$type1 = 'float';
							}
						} else if (preg_match("/^true$/i", $term1)) {
							$type1 = 'bool';
							$term1 = true;
						} else if (preg_match("/^false$/i", $term1)) {
							$type1 = 'bool';
							$term1 = false;
						} else {
							$type1 = 'syntaxError';
						}
				}
				$parsed['term1'] = ['value' => $term1, 'type' => $type1];

				switch($matches[5]) {
					case '"':
					case "'":
						$type2 = 'string';
						break;
					case '$$':
						$type2 = 'localVariable';
						break;
					case '$':
						$type2 = 'globalVariable';
						break;
					default:
						if (is_numeric($term2)) {
							if (intval($term2) == floatval($term2)) {
								$type2 = 'int';
								$term2 = intval($term2);
							} else {
								$term2 = floatval($term2);
								$type2 = 'float';
							}
						} else if (preg_match("/^true$/i", $term2)) {
							$type2 = 'bool';
							$term2 = true;
						} else if (preg_match("/^false$/i", $term2)) {
							$type2 = 'bool';
							$term2 = false;
						} else {
							$type2 = 'syntaxError';
						}
				}
				$parsed['term2'] = ['value' => $term2, 'type' => $type2];

			}
			return $parsed;
		}

		private static function splitActions($actions): array
		{
			$list = explode(';', $actions);
			foreach ($list as $k => $row) {
				$row = trim($row);
				$list[$k] = self::parseAction($row);
			}
			return $list;
		}

		private static function parseAction($actionString): array {
			$action = ['parameters' => []];
			$pattern = "/^(\w+)\s*\((.*)\)$/";
			if (preg_match($pattern, $actionString, $matches)) {
				$action['cmd'] = $matches[1];
				if ($matches[2] !== '') {
					$action['parameters'] = self::parseParams($matches[2]);
				}
			} else {
				$action['cmd'] = 'error';
				$action['parameters'][] = $actionString;
			}
			$quotePattern = "/^(['\"])(.*)\\1$/";
			$subCommandPattern = "/^(avg|sum)\s*\(.*?\)/";
			if (count($action['parameters']) > 0) {
				foreach ($action['parameters'] as $paramNum => $param) {
					$param = trim($param);
					if (preg_match($quotePattern, $param)) {
						$action['parameters'][$paramNum] = preg_replace($quotePattern, "$2", $param);
					} elseif (preg_match($subCommandPattern, $param)) {
						$action['parameters'][$paramNum] = self::parseaction($param);
					} elseif (is_numeric($param)) {
						if (intval($param) == floatval($param)) {
							$action['parameters'][$paramNum] = intval($param);
						} else {
							$action['parameters'][$paramNum] = floatval($param);
						}
					}
				}
			}
			return $action;
		}

		private static function parseParams($paramString): array
		{
			$params = [];
			$current = '';
			$depth = 0;
			$length = strlen($paramString);

			for ($i = 0; $i < $length; $i++) {
				$char = $paramString[$i];

				if ($char === ',' && $depth === 0) {
					$params[] = trim($current);
					$current = '';
				} else {
					if ($char === '(') {
						$depth++;
					} elseif ($char === ')') {
						$depth--;
					}
					$current .= $char;
				}
			}

			if (trim($current) !== '') {
				$params[] = trim($current);
			}

			return $params;
		}


	}


