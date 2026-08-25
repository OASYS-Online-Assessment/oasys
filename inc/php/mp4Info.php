<?php

	/*
	 * Class mp4Info v1.01
	 */
	class mp4Info
	{

		private $handle;
		private ?rixPDO $db = null;
		private array $info = [];
		private ?array $track = null;
		private bool $debug = false;
		private string $mediaLocation;
		private int $position = 0;
		private int $fileId = -1;
		private int $filesize = 0;
		private bool $valid;

		/* constants */
		const AUDIO_VIDEO = 1;
		const AUDIO = 2;
		const VIDEO = 3;
		const UNKNOWN = 4;
		const INVALID = 99;

		/**
		 * @throws Exception
		 */
		public function __construct($mediaLocation, $path, $db = null)
		{
			$this->mediaLocation = $mediaLocation;
			if ($this->mediaLocation === 'database') {
				if ($db instanceof rixPDO) {
					$this->db = $db;
				} else {
					throw new Exception('Missing instance to database');
				}
				if (is_numeric($path)) {
					$this->fileId = is_integer($path) ? $path : intval($path);
				} else {
					throw new Exception('Path must be the auto increment id of the file');
				}
				$results = $db->fetchValue("SELECT COUNT(*) FROM mediaFiles WHERE id=?", [$this->fileId]);
				if ($results['error'] || $results['rows'] < 1) {
					throw new Exception('Error reading from blob');
				}
				if ($results['data'] !== 1) {
					throw new Exception('Could not open blob');
				}
				$this->position = 0;
				$results = $db->fetchValue("SELECT LENGTHB(data) FROM mediaFiles WHERE id=?", [$this->fileId]);
				$this->filesize = $results['data'];
			} else {
				if (!file_exists($path)) {
					throw new Exception('File not found');
				}

				$this->handle = fopen($path, 'r');
				if ($this->handle === false) {
					throw new Exception('Could not open file');
				}
			}

			$fpos = $this->tell();
			$data = $this->readChunk();

			if ($data['name'] !== 'ftyp') {
				$this->valid = false;
				return;
			} else {
				$this->valid = true;
			}

			$len = $data['length'];
			$this->readString(4, 'majorBrand');
			$this->readString(4, 'minorBrand');

			//advance filepointer to next atom
			$this->nextAtom($fpos, $len);

			while (!$this->eof()) {
				$this->readAtom();
			}

			$this->setTrack(); //copies previous track data to info['tracks']
		}

		public function __destruct()
		{
			if ($this->mediaLocation === 'disk') {
				fclose($this->handle);
			}
		}

		public function isValid(): bool
		{
			return $this->valid;
		}

		public function getInfo(): array
		{
			return $this->info;
		}

		public function getType(): int
		{
			if (!$this->valid) {
				return self::INVALID;
			}
			$audio = false;
			$video = false;
			foreach ($this->info['tracks'] as $track) {
				if ($track['type'] === 'soun') {
					$audio = true;
				}
				if ($track['type'] === 'vide') {
					$video = true;
				}
			}
			if ($audio && $video) {
				return self::AUDIO_VIDEO;
			} elseif ($audio) {
				return self::AUDIO;
			} elseif ($video) {
				return self::VIDEO;
			} else {
				return self::UNKNOWN;
			}
		}

		/* ------------- private functions --------------- */

		private function eof(): bool
		{
			if ($this->mediaLocation === 'database') {
				return $this->filesize <= $this->position;
			} else {
				return feof($this->handle);
			}
		}

		private function seek($length, $whence = SEEK_SET): void
		{
			if ($this->mediaLocation === 'database') {
				if ($whence === SEEK_SET) {
					$this->position = $length;
				} elseif ($whence === SEEK_CUR) {
					$this->position += $length;
				}
			} else {
				fseek($this->handle, $length, $whence);
				$this->position = ftell($this->handle);
			}
		}

		private function tell(): int
		{
			return $this->position;
		}

		/**
		 * @throws Exception
		 */
		private function read($length): ?string
		{
			if ($length <= 0) {
				return null;
			}
			if ($this->mediaLocation === 'database') {
				$query = "SELECT SUBSTR(`data`,?,?) FROM mediaFiles WHERE id = ?";
				$results = $this->db->fetchValue($query, [($this->position + 1), $length, $this->fileId]);
				if ($results['error'] || $results['rows'] < 1) {
					throw new Exception('Error reading from blob');
				}
				$this->position += $length;
				return $results['data'];
			} else {
				$buffer = fread($this->handle, $length);
				$this->position = ftell($this->handle);
				return $buffer;
			}
		}

		/**
		 * @throws Exception
		 */
		private function readAtom(): void
		{
			$fpos = $this->tell();
			$data = $this->readChunk();
			if ($data === false) {
				return;
			}
			$len = $data['length'];
			$name = $data['name'];
			if ($this->debug) {
				$this->info['debug'][] = ['name' => $name, 'length' => $len, 'pos' => $fpos];
			}

			switch ($name) {
				case 'mvhd':
					$this->readMVHD();
					$this->nextAtom($fpos, $len);
					break;
				case 'tkhd':
					$this->readTKHD();
					$this->nextAtom($fpos, $len);
					break;
				case 'hdlr':
					$this->readHDLR($len);
					$this->nextAtom($fpos, $len);
					break;
				case 'trak':
					$this->setTrack(); //copies previous track data to info['tracks']
					$this->track = [];
					/*  do not skip this atom -> it contains subatoms that we need to parse */
					break;
				case 'moov':
				case 'mdia':
					/*  do not skip these atoms -> they contain subatoms that we need to parse */
					break;
				default:
					//any other atoms are of no interest to us and can be skipped right away
					$this->nextAtom($fpos, $len);
			}

		}

		/* reads 32 bit unsigned integer for length of box and 4 byte string with box name */
		/**
		 * @throws Exception
		 */
		private function readChunk(): bool|array
		{
			$buffer = $this->read(8);
			if (strlen($buffer) < 8) {
				return false;
			}
			return unpack('N1length/a4name', $buffer);
		}

		/**
		 * @throws Exception
		 */
		private function readMVHD(): void
		{
			$buffer = $this->read(4);
			$data = unpack("C1version", $buffer);
			/* find timescale and duration of media file, skip rest of the info */
			switch ($data['version']) {
				case 0:
					$buffer = $this->read(16);
					$data = unpack("N1creation/N1modification/N1timescale/N1duration", $buffer);
					break;
				case 1:
					$buffer = $this->read(28);
					$data = unpack("J1creation/J1modification/N1timescale/J1duration", $buffer);
					break;
			}
			$this->info['timescale'] = $data['timescale'];
			$this->info['duration'] = $data['duration'] / $data['timescale']; //convert to seconds
		}

		/**
		 * @throws Exception
		 */
		private function readTKHD(): void
		{
			$buffer = $this->read(4);
			$data = unpack("C1version", $buffer);

			switch ($data['version']) {
				case 0:
					$buffer = $this->read(20);
					$data = unpack("N1creation/N1modification/N1id/N1reserved/N1duration", $buffer);
					break;
				case 1:
					$buffer = $this->read(32);
					$data = unpack("J1creation/J1modification/N1id/N1reserved/J1duration", $buffer);
					break;
			}
			$this->track['id'] = $data['id'];
			$this->track['duration'] = $data['duration'] / $this->info['timescale']; //convert to seconds
			$this->skipBytes(52);
			$buffer = $this->read(8);
			$data = unpack("n1width/n1widthdecimal/n1height/n1heightdecimal", $buffer);

			//no idea why there is a decimal part for the dimensions … let's skip it for now
			$this->track['width'] = $data['width'];
			$this->track['height'] = $data['height'];
		}

		/**
		 * @throws Exception
		 */
		private function readHDLR($len): void
		{
			$buffer = $this->read($len - 8);
			$nameLength = $len - 32;
			$data = unpack("C1version/C3flags/N1predefined/a4handler/N3reserved/a{$nameLength}name", $buffer);

			//no idea why there is a decimal part for the dimensions … let's skip it for now
			$this->track['type'] = $data['handler'];
			$this->track['name'] = $data['name'];
		}

		/**
		 * @throws Exception
		 */
		private function readString($length, $name): void
		{
			$buffer = $this->read($length);
			$data = unpack("a$length", $buffer);
			$this->info[$name] = $data[1];
		}

		private function nextAtom($start, $length): void
		{
			if ($length > 0) {
				$this->seek($start + $length);
			}
		}

		private function skipBytes($length): void
		{
			if ($length > 0) {
				$this->seek($length, SEEK_CUR);
			}
		}

		private function setTrack(): void
		{
			if ($this->track !== null) {
				$this->info['tracks'][$this->track['id']] = $this->track;
				if ($this->track['type'] === 'vide') {
					$this->info['width'] = $this->track['width'];
					$this->info['height'] = $this->track['height'];
				}
				$this->track = null;
			}
		}

	}